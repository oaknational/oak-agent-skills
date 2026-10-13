import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { githubApi, type Api, type PullRequest } from '../../scripts/coverage-matrix/api.ts';
import { collect, type Options, type Row } from '../../scripts/coverage-matrix/collect.ts';
import { renderJson, renderMarkdown, versionSpread } from '../../scripts/coverage-matrix/report.ts';
import { repoRoot } from '../helpers/paths.ts';

const PACKAGE = '@oaknational/oak-agent-skills';
const NOW = new Date('2026-11-02T12:00:00Z');

interface FixtureRepo {
  archived?: boolean;
  files: Record<string, string>;
  pulls?: PullRequest[];
}

function lockfile(importers: Record<string, Record<string, string>>, version = "'9.0'"): string {
  const lines = [`lockfileVersion: ${version}`, '', 'importers:'];
  for (const [importer, deps] of Object.entries(importers)) {
    lines.push(`  ${importer}:`, '    devDependencies:');
    for (const [name, depVersion] of Object.entries(deps)) {
      lines.push(
        `      '${name}':`,
        `        specifier: ${depVersion}`,
        `        version: ${depVersion}`,
      );
    }
  }
  return `${lines.join('\n')}\n`;
}

function packageJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    name: 'x',
    packageManager: 'pnpm@11.2.0',
    devDependencies: { [PACKAGE]: '1.2.3' },
    oakSkills: { profiles: ['base'] },
    ...overrides,
  });
}

const manifest = JSON.stringify({
  package: { version: '1.2.0' },
  skills: { 'oak-a': {}, 'oak-b': {} },
});
const ours = { '.': { [PACKAGE]: '1.2.3' } };

function fakeApi(repos: Record<string, FixtureRepo>): Api {
  return {
    listRepositories: () =>
      Promise.resolve(
        Object.entries(repos).map(([name, repo]) => ({ name, archived: repo.archived ?? false })),
      ),
    readFile: (_org, repo, path) => Promise.resolve(repos[repo]?.files[path]),
    pullRequests: (_org, repo) => Promise.resolve(repos[repo]?.pulls ?? []),
  };
}

const options: Options = {
  org: 'oaknational',
  sandbox: 'oak-agent-skills-sandbox',
  includeSandbox: false,
  now: NOW,
};

async function rows(
  repos: Record<string, FixtureRepo>,
  overrides: Partial<Options> = {},
): Promise<Row[]> {
  return collect(fakeApi(repos), { ...options, ...overrides });
}

const flagsOf = (all: Row[], name: string) => all.find((row) => row.repository === name)?.flags;

describe('collect', () => {
  it('reports a well-configured repository with no flags', async () => {
    const [row] = await rows({
      'oak-web': {
        files: {
          'package.json': packageJson({
            oakSkills: { profiles: ['base', 'frontend'], bundle: 'owa' },
          }),
          'pnpm-lock.yaml': lockfile({
            '.': { [PACKAGE]: '1.2.3(typescript@6.0.3)', react: '19.0.0' },
          }),
          '.agents/skills/.oak-manifest.json': manifest,
          'pnpm-workspace.yaml':
            "minimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - '@oaknational/*'\n",
          '.github/dependabot.yml': `updates:\n  - cooldown:\n      default-days: 7\n      exclude: ['${PACKAGE}']\n`,
        },
        pulls: [
          {
            number: 9,
            title: `chore(deps): bump ${PACKAGE} from 1.2.2 to 1.2.3`,
            author: 'dependabot[bot]',
            state: 'open',
            createdAt: '2026-10-30T12:00:00Z',
            mergedAt: null,
          },
          {
            number: 8,
            title: `chore(deps): bump ${PACKAGE} from 1.2.1 to 1.2.2`,
            author: 'dependabot[bot]',
            state: 'closed',
            createdAt: '2026-10-20T00:00:00Z',
            mergedAt: '2026-10-22T12:00:00Z',
          },
          {
            number: 7,
            title: 'feat: something else',
            author: 'someone',
            state: 'open',
            createdAt: '2026-10-01T00:00:00Z',
            mergedAt: null,
          },
        ],
      },
    });
    expect(row).toEqual({
      repository: 'oak-web',
      version: '1.2.3',
      syncedVersion: '1.2.0',
      profiles: ['base', 'frontend'],
      bundle: 'owa',
      skills: 2,
      openUpdate: { number: 9, days: 3 },
      lastMergeDays: 2,
      flags: [],
    });
  });

  it('skips archived repositories, the sandbox, and repositories that do not use the package', async () => {
    const all = await rows({
      archived: { archived: true, files: { 'package.json': packageJson() } },
      'oak-agent-skills-sandbox': {
        files: { 'package.json': packageJson(), 'pnpm-lock.yaml': lockfile(ours) },
      },
      'no-package-json': { files: {} },
      'broken-package-json': { files: { 'package.json': '{' } },
      'not-a-consumer': {
        files: { 'package.json': JSON.stringify({ name: 'x', devDependencies: { react: '1' } }) },
      },
      'no-dependencies': { files: { 'package.json': JSON.stringify({ name: 'x' }) } },
      consumer: { files: { 'package.json': packageJson(), 'pnpm-lock.yaml': lockfile(ours) } },
    });
    expect(all.map((row) => row.repository)).toEqual(['consumer']);
  });

  it('includes the sandbox during the rehearsal', async () => {
    const all = await rows(
      {
        'oak-agent-skills-sandbox': {
          files: { 'package.json': packageJson(), 'pnpm-lock.yaml': lockfile(ours) },
        },
      },
      { includeSandbox: true },
    );
    expect(all.map((row) => row.repository)).toEqual(['oak-agent-skills-sandbox']);
  });

  it('flags a UI framework anywhere in a workspace without the frontend profile', async () => {
    const all = await rows({
      workspace: {
        files: {
          'package.json': packageJson(),
          'pnpm-lock.yaml': lockfile({
            ...ours,
            'apps/web': { next: '15.0.0', 'react-dom': '19.0.0' },
          }),
        },
      },
    });
    expect(flagsOf(all, 'workspace')).toEqual([
      'Uses react-dom, next but not the frontend profile',
    ]);
  });

  it('flags two repositories claiming the same bundle', async () => {
    const repo = {
      files: {
        'package.json': packageJson({ oakSkills: { profiles: ['base'], bundle: 'oc' } }),
        'pnpm-lock.yaml': lockfile(ours),
      },
    };
    const all = await rows({
      'repo-a': repo,
      'repo-b': repo,
      'repo-c': { files: { 'package.json': packageJson(), 'pnpm-lock.yaml': lockfile(ours) } },
    });
    expect(flagsOf(all, 'repo-a')).toEqual(['Bundle "oc" is also claimed by repo-b']);
    expect(flagsOf(all, 'repo-b')).toEqual(['Bundle "oc" is also claimed by repo-a']);
    expect(flagsOf(all, 'repo-c')).toEqual([]);
  });

  it('flags a release age without an exemption', async () => {
    const all = await rows({
      held: {
        files: {
          'package.json': packageJson(),
          'pnpm-lock.yaml': lockfile(ours),
          'pnpm-workspace.yaml': 'minimumReleaseAge: 10080\n',
        },
      },
    });
    expect(flagsOf(all, 'held')).toEqual([
      'minimumReleaseAge without an exemption for the package',
    ]);
  });

  it('flags a Dependabot cooldown without an exemption, in either file name', async () => {
    const cooldown = 'updates:\n  - cooldown:\n      default-days: 5\n';
    const all = await rows({
      yml: {
        files: {
          'package.json': packageJson(),
          'pnpm-lock.yaml': lockfile(ours),
          '.github/dependabot.yml': cooldown,
        },
      },
      yaml: {
        files: {
          'package.json': packageJson(),
          'pnpm-lock.yaml': lockfile(ours),
          '.github/dependabot.yaml': cooldown,
        },
      },
    });
    expect(flagsOf(all, 'yml')).toEqual([
      'Dependabot cooldown without an exemption for the package',
    ]);
    expect(flagsOf(all, 'yaml')).toEqual([
      'Dependabot cooldown without an exemption for the package',
    ]);
  });

  it('flags a missing packageManager field', async () => {
    const all = await rows({
      'no-pm': {
        files: {
          'package.json': packageJson({ packageManager: undefined }),
          'pnpm-lock.yaml': lockfile(ours),
        },
      },
    });
    expect(flagsOf(all, 'no-pm')).toEqual(['No packageManager field']);
  });

  it('flags the package in dependencies rather than devDependencies', async () => {
    const all = await rows({
      prod: {
        files: {
          'package.json': packageJson({
            devDependencies: {},
            dependencies: { [PACKAGE]: '1.2.3' },
          }),
          'pnpm-lock.yaml': lockfile(ours),
        },
      },
    });
    expect(flagsOf(all, 'prod')).toEqual(['The package is in dependencies, not devDependencies']);
  });

  it('flags a missing lockfile or an unreadable manifest', async () => {
    const all = await rows({
      bare: { files: { 'package.json': packageJson(), '.agents/skills/.oak-manifest.json': '{' } },
    });
    expect(all[0]).toMatchObject({
      version: undefined,
      syncedVersion: undefined,
      skills: undefined,
      flags: ['No pnpm-lock.yaml', 'Unreadable sync manifest'],
    });
  });

  it.each([
    ['an older format', "'6.0'"],
    ['a number', '5.4'],
    ['no version', 'null'],
  ])('stops on a lockfile with %s, rather than guessing', async (_label, version) => {
    await expect(
      rows({
        old: {
          files: { 'package.json': packageJson(), 'pnpm-lock.yaml': lockfile(ours, version) },
        },
      }),
    ).rejects.toThrow("old's pnpm-lock.yaml has lockfileVersion");
  });

  it('copes with an empty lockfile', async () => {
    await expect(
      rows({ empty: { files: { 'package.json': packageJson(), 'pnpm-lock.yaml': '' } } }),
    ).rejects.toThrow('lockfileVersion none');
  });

  it('reads settings that are missing or of the wrong type', async () => {
    const [row] = await rows({
      odd: {
        files: {
          'package.json': packageJson({ oakSkills: { profiles: 'base', bundle: 3 } }),
          'pnpm-lock.yaml': "lockfileVersion: '9.0'\n",
        },
      },
    });
    expect(row).toMatchObject({ profiles: [], bundle: undefined, version: undefined });
  });

  it('copes with a package.json with no oakSkills settings', async () => {
    const [row] = await rows({
      unset: {
        files: {
          'package.json': packageJson({ oakSkills: undefined }),
          'pnpm-lock.yaml': lockfile(ours),
        },
      },
    });
    expect(row?.profiles).toEqual([]);
  });
});

describe('the report', () => {
  const sample: Row[] = [
    {
      repository: 'a',
      version: '1.2.3',
      syncedVersion: '1.2.3',
      profiles: ['base'],
      bundle: 'owa',
      skills: 3,
      openUpdate: { number: 4, days: 2 },
      lastMergeDays: 1,
      flags: [],
    },
    {
      repository: 'b',
      version: undefined,
      syncedVersion: undefined,
      profiles: [],
      bundle: undefined,
      skills: undefined,
      openUpdate: undefined,
      lastMergeDays: undefined,
      flags: ['One | two', 'Three'],
    },
    {
      repository: 'c',
      version: '1.2.3',
      syncedVersion: '1.2.0',
      profiles: ['base', 'frontend'],
      bundle: undefined,
      skills: 2,
      openUpdate: undefined,
      lastMergeDays: undefined,
      flags: [],
    },
  ];

  it('counts the versions in use', () => {
    expect(versionSpread(sample)).toEqual({ '1.2.3': 2, unknown: 1 });
  });

  it('renders a table with a header row, escaping pipes', () => {
    const markdown = renderMarkdown(sample, NOW);
    expect(markdown).toContain(
      '3 repositories use `@oaknational/oak-agent-skills`, as of 2026-11-02.',
    );
    expect(markdown).toContain('Versions in use: 1.2.3 (2), unknown (1).');
    expect(markdown).toContain('Repositories with flags to look at: 1.');
    expect(markdown).toContain(
      '| Repository | Version | Skills synced from | Profiles | Bundle | Skills | Open update | Last update merged after | Flags |\n| --- |',
    );
    expect(markdown).toContain(
      '| a | 1.2.3 | 1.2.3 | base | owa | 3 | #4, open 2 days | 1 days | none |',
    );
    expect(markdown).toContain(
      '| b | unknown | not synced | none | none | none | none | none | One \\| two; Three |',
    );
  });

  it('says when no repository uses the package yet', () => {
    expect(renderMarkdown([], NOW)).toBe(
      '# Agent skills coverage\n\n0 repositories use `@oaknational/oak-agent-skills`, as of 2026-11-02.\n\n',
    );
    expect(renderMarkdown(sample.slice(0, 1), NOW)).toContain('1 repository uses');
  });

  it('saves the same data as JSON', () => {
    expect(JSON.parse(renderJson(sample, NOW, 'oaknational'))).toMatchObject({
      generatedAt: NOW.toISOString(),
      org: 'oaknational',
      versions: { '1.2.3': 2, unknown: 1 },
      repositories: [{ repository: 'a' }, { repository: 'b' }, { repository: 'c' }],
    });
  });
});

describe('githubApi', () => {
  function fakeFetch(responses: Record<string, { status?: number; body: unknown }>) {
    const requests: { url: string; headers: Record<string, string> }[] = [];
    const fetchImpl = (url: string | URL | Request, init?: RequestInit) => {
      const key = (typeof url === 'string' ? url : url instanceof URL ? url.href : url.url).replace(
        'https://api.github.com',
        '',
      );
      requests.push({ url: key, headers: init?.headers as Record<string, string> });
      const response = responses[key] ?? { status: 404, body: { message: 'Not Found' } };
      const status = response.status ?? 200;
      return Promise.resolve(
        new Response(
          typeof response.body === 'string' ? response.body : JSON.stringify(response.body),
          { status },
        ),
      );
    };
    return { requests, fetchImpl: fetchImpl };
  }

  it('lists every page of repositories', async () => {
    const page1 = Array.from({ length: 100 }, (_, i) => ({
      name: `r${String(i)}`,
      archived: i === 0,
    }));
    const { fetchImpl, requests } = fakeFetch({
      '/orgs/o/repos?type=all&per_page=100&page=1': { body: page1 },
      '/orgs/o/repos?type=all&per_page=100&page=2': { body: [{ name: 'last', archived: false }] },
    });
    const repos = await githubApi('t', fetchImpl).listRepositories('o');
    expect(repos).toHaveLength(101);
    expect(repos[0]).toEqual({ name: 'r0', archived: true });
    expect(requests[0]?.headers).toMatchObject({
      Authorization: 'Bearer t',
      'X-GitHub-Api-Version': '2022-11-28',
    });
  });

  it('reads a raw file, giving undefined when it is missing', async () => {
    const { fetchImpl, requests } = fakeFetch({
      '/repos/o/r/contents/package.json': { body: '{"name":"x"}' },
    });
    const api = githubApi('t', fetchImpl);
    await expect(api.readFile('o', 'r', 'package.json')).resolves.toBe('{"name":"x"}');
    await expect(api.readFile('o', 'r', 'missing.json')).resolves.toBeUndefined();
    expect(requests[0]?.headers.Accept).toBe('application/vnd.github.raw');
  });

  it('fails on other errors', async () => {
    const { fetchImpl } = fakeFetch({
      '/repos/o/r/contents/package.json': { status: 500, body: 'oops' },
      '/orgs/o/repos?type=all&per_page=100&page=1': { status: 403, body: {} },
    });
    const api = githubApi('t', fetchImpl);
    await expect(api.readFile('o', 'r', 'package.json')).rejects.toThrow('returned 500');
    await expect(api.listRepositories('o')).rejects.toThrow(
      '/orgs/o/repos?type=all&per_page=100&page=1 returned 403',
    );
  });

  it('lists pull requests with their authors', async () => {
    const { fetchImpl } = fakeFetch({
      '/repos/o/r/pulls?state=all&sort=created&direction=desc&per_page=100': {
        body: [
          {
            number: 1,
            title: 't',
            user: { login: 'dependabot[bot]' },
            state: 'open',
            created_at: 'c',
            merged_at: null,
          },
          { number: 2, title: 'u', user: null, state: 'closed', created_at: 'd', merged_at: 'e' },
        ],
      },
    });
    await expect(githubApi('t', fetchImpl).pullRequests('o', 'r')).resolves.toEqual([
      {
        number: 1,
        title: 't',
        author: 'dependabot[bot]',
        state: 'open',
        createdAt: 'c',
        mergedAt: null,
      },
      { number: 2, title: 'u', author: '', state: 'closed', createdAt: 'd', mergedAt: 'e' },
    ]);
  });
});

describe('scripts/coverage-matrix.ts', () => {
  it('needs a token', () => {
    const result = spawnSync(process.execPath, [join(repoRoot, 'scripts/coverage-matrix.ts')], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: '' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Set GITHUB_TOKEN');
  });
});
