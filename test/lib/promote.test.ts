import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExitCode } from '../../src/lib/exit-codes.ts';
import {
  fillTemplate,
  originatingRepo,
  promote,
  pullRequestTitle,
  setUpdatedDate,
  type PromoteOptions,
} from '../../src/lib/promote.ts';
import { computeStatus, statusExitCode } from '../../src/lib/status.ts';
import { applySync, planSync } from '../../src/lib/sync.ts';
import {
  createCentralRemote,
  fakeGitHub,
  type CentralRemote,
  type FakeGitHub,
} from '../helpers/central.ts';
import { copyPackage, setOakSkills, setPackageVersion } from '../helpers/consumer.ts';
import { packageFixture, repoRoot } from '../helpers/paths.ts';
import { createTempRepo, isolatedGitEnv, type TempRepo } from '../helpers/temp-repo.ts';
import { removeTree, skillText, writeTree } from '../helpers/tree.ts';

const NOW = new Date('2026-11-02T10:00:00Z');
const cleanups: (() => void)[] = [];

beforeEach(() => {
  // The developer's git identity, which promote commits as.
  for (const key of [
    'GIT_AUTHOR_NAME',
    'GIT_AUTHOR_EMAIL',
    'GIT_COMMITTER_NAME',
    'GIT_COMMITTER_EMAIL',
  ] as const) {
    vi.stubEnv(key, isolatedGitEnv[key] ?? '');
  }
});
afterEach(() => {
  vi.unstubAllEnvs();
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function central(version?: string, packageDir?: string): CentralRemote {
  const created = createCentralRemote(version, packageDir);
  cleanups.push(created.cleanup);
  return created;
}

// A consuming repository on GitHub, synced from the stand-in package, with an edited skill.
function consumer(
  packageDir = packageFixture,
  oakSkills: unknown = { profiles: ['base'], bundle: 'owa' },
): TempRepo {
  const repo = createTempRepo('single-package');
  cleanups.push(repo.cleanup);
  repo.git('remote', 'add', 'origin', 'git@github.com:oaknational/owa-test.git');
  setOakSkills(repo.root, oakSkills);
  applySync(planSync(repo.root, packageDir));
  repo.git('add', '--all');
  repo.git('commit', '--quiet', '--message', 'chore: sync agent skills');
  return repo;
}

const ALPHA = '.agents/skills/oak-alpha/SKILL.md';
const editAlpha = (
  root: string,
  from = 'Read [the guide](references/guide.md).',
  to = 'Read [the guide](references/guide.md) first.',
) => {
  const file = join(root, ALPHA);
  writeFileSync(file, readFileSync(file, 'utf8').replace(from, to));
};

const options = (overrides: Partial<PromoteOptions> = {}): PromoteOptions => ({
  name: 'oak-alpha',
  isNew: false,
  bundle: undefined,
  bump: 'patch',
  message: 'Say to read the guide first',
  dryRun: false,
  ...overrides,
});

function run(
  root: string,
  github: FakeGitHub,
  overrides: Partial<PromoteOptions> = {},
  packageDir = packageFixture,
) {
  const log: string[] = [];
  return {
    log,
    promise: promote(
      { cwd: root, github, prompt: undefined, packageDir, now: NOW, log: (text) => log.push(text) },
      options(overrides),
    ),
  };
}

describe('promote, 6.1: preconditions', () => {
  it.each([
    ['gh is not installed', 'The GitHub CLI, gh, is not installed.'],
    ['gh is not signed in', 'gh is not signed in. Run "gh auth login" first.'],
  ])('stops when %s', async (_label, problem) => {
    const repo = consumer();
    editAlpha(repo.root);
    const github = fakeGitHub(central(), { problem: () => problem });
    await expect(run(repo.root, github).promise).rejects.toThrow(problem);
    expect(github.cloned).toBe(0);
  });

  it('stops without write access to the central repository', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    await expect(
      run(repo.root, fakeGitHub(central(), { canPush: () => false })).promise,
    ).rejects.toThrow("You don't have write access to oaknational/oak-agent-skills");
  });

  it('stops when git is not installed', async () => {
    const repo = consumer();
    vi.stubEnv('PATH', '');
    await expect(run(repo.root, fakeGitHub(central())).promise).rejects.toThrow(
      'git is not installed',
    );
  });

  it('stops on a version mismatch, because syncing first would replace the edit', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const newer = copyPackage();
    cleanups.push(() => {
      removeTree(newer);
    });
    setPackageVersion(newer, '1.3.0');
    const failure = run(repo.root, fakeGitHub(central()), {}, newer).promise;
    await expect(failure).rejects.toThrow(
      "The skills are out of date, so promote can't tell your edit apart",
    );
    await expect(failure).rejects.toThrow(
      expect.objectContaining({ hint: expect.stringContaining('previous lockfile') as unknown }),
    );
  });

  it('stops when something unmanaged is in the skill folders', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    writeTree(repo.root, { '.agents/skills/owa-draft/SKILL.md': skillText({ name: 'owa-draft' }) });
    await expect(run(repo.root, fakeGitHub(central())).promise).rejects.toThrow(
      "Something oak-skills didn't write is in the skill folders: .agents/skills/owa-draft.",
    );
  });

  it('stops with the configuration exit code on a configuration problem', async () => {
    const repo = consumer();
    setOakSkills(repo.root, { profiles: ['nope'] });
    await expect(run(repo.root, fakeGitHub(central())).promise).rejects.toThrow(
      expect.objectContaining({ exitCode: ExitCode.Configuration }),
    );
  });

  it("stops when the skill isn't synced here", async () => {
    const repo = consumer();
    await expect(
      run(repo.root, fakeGitHub(central()), { name: 'oak-gamma' }).promise,
    ).rejects.toThrow("oak-gamma isn't one of this repository's synced skills.");
  });

  it.each(['constructor', 'toString', '__proto__'])(
    'stops on %s, a name every object inherits, as a skill not synced here',
    async (name) => {
      const repo = consumer();
      await expect(run(repo.root, fakeGitHub(central()), { name }).promise).rejects.toThrow(
        `${name} isn't one of this repository's synced skills.`,
      );
    },
  );

  it('stops when the skill has not been edited', async () => {
    const repo = consumer();
    await expect(run(repo.root, fakeGitHub(central())).promise).rejects.toThrow(
      "oak-alpha hasn't been edited: it matches the synced copy",
    );
  });

  it('stops when the repository has never synced', async () => {
    const repo = createTempRepo('single-package');
    cleanups.push(repo.cleanup);
    setOakSkills(repo.root, { profiles: ['base'] });
    await expect(run(repo.root, fakeGitHub(central())).promise).rejects.toThrow(
      'The skills are out of date',
    );
  });
});

describe('promote, 6.2, 6.3 and 6.9: the change, its source and dry runs', () => {
  it('shows the diff of exactly what was edited, and changes nothing on a dry run', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const github = fakeGitHub(central());
    const result = await run(repo.root, github, { dryRun: true }).promise;
    expect(result.change).toContain('-Read [the guide](references/guide.md).');
    expect(result.change).toContain('+Read [the guide](references/guide.md) first.');
    expect(result.change.match(/^[+-][^+-]/gm)).toHaveLength(2);
    expect(result).toMatchObject({
      title: 'fix(oak-alpha): say to read the guide first',
      url: undefined,
    });
    expect(github.cloned).toBe(0);
    expect(github.pullRequests).toEqual([]);
    expect(repo.git('status', '--porcelain')).toBe(`M ${ALPHA}`);
  });

  it('skips the GitHub checks on a dry run', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const github = fakeGitHub(central(), { problem: () => 'gh is not signed in.' });
    await expect(run(repo.root, github, { dryRun: true }).promise).resolves.toMatchObject({
      bump: 'patch',
    });
  });

  it('finds a bundle skill under skills/repos/<code>/', async () => {
    const repo = consumer();
    const file = join(repo.root, '.agents/skills/owa-routing/SKILL.md');
    writeFileSync(file, `${readFileSync(file, 'utf8')}\nMore routing advice.\n`);
    const remote = central();
    const github = fakeGitHub(remote);
    await run(repo.root, github, { name: 'owa-routing', message: 'Add routing advice' }).promise;
    const branch = github.pullRequests[0]?.head ?? '';
    expect(remote.read(branch, 'skills/repos/owa/owa-routing/SKILL.md')).toContain(
      'More routing advice.',
    );
  });
});

describe('promote, 6.4 to 6.7: the pull request', () => {
  it('opens a pull request with the edit, the date, a changeset and the filled template, then restores the copy', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const remote = central();
    const github = fakeGitHub(remote);
    const { promise } = run(repo.root, github);
    const result = await promise;

    expect(result).toMatchObject({
      url: 'https://github.com/oaknational/oak-agent-skills/pull/1',
      conflicted: false,
      title: 'fix(oak-alpha): say to read the guide first',
    });
    const pr = github.pullRequests[0];
    expect(pr).toMatchObject({ repo: 'oaknational/oak-agent-skills', base: 'main', draft: false });
    expect(pr?.head).toBe(`promote/oak-alpha-${String(NOW.getTime())}`);

    const skill = remote.read(pr?.head ?? '', 'skills/central/oak-alpha/SKILL.md');
    expect(skill).toContain('Read [the guide](references/guide.md) first.');
    expect(skill).toContain("updated: '2026-11-02'");
    expect(
      remote.read(pr?.head ?? '', `.changeset/promote-oak-alpha-${String(NOW.getTime())}.md`),
    ).toBe("---\n'@oaknational/oak-agent-skills': patch\n---\n\nSay to read the guide first.");
    const commit = spawnSync('git', ['log', '-1', '--format=%s%n%b', pr?.head ?? ''], {
      cwd: remote.remote,
      encoding: 'utf8',
    }).stdout;
    expect(commit).toContain('fix(oak-alpha): say to read the guide first');
    expect(commit).toContain('Originating-Repo: oaknational/owa-test');

    expect(pr?.body).toContain('## What changed and why\n\nSay to read the guide first');
    expect(pr?.body).toContain('## Skills affected\n\nskills/central/oak-alpha');
    expect(pr?.body).toContain('Originating-Repo: oaknational/owa-test');
    expect(pr?.body).toContain('- [ ] This needs agent judgement');

    expect(statusExitCode(computeStatus(repo.root, packageFixture))).toBe(ExitCode.Ok);
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  it('applies a diff that ends on a blank line of context', async () => {
    const pkg = copyPackage();
    cleanups.push(() => {
      removeTree(pkg);
    });
    const guide = 'skills/central/oak-alpha/references/guide.md';
    writeFileSync(join(pkg, guide), '# Alpha guide\n\nOne.\nTwo.\nThree.\nFour.\n\nMore.\n');
    const repo = consumer(pkg);
    const local = join(repo.root, '.agents/skills/oak-alpha/references/guide.md');
    writeFileSync(local, readFileSync(local, 'utf8').replace('Two.', 'Two words.'));
    const remote = central('1.2.3', pkg);
    const github = fakeGitHub(remote);
    const result = await run(repo.root, github, {}, pkg).promise;
    expect(result.conflicted).toBe(false);
    expect(remote.read(github.pullRequests[0]?.head ?? '', guide)).toBe(
      '# Alpha guide\n\nOne.\nTwo words.\nThree.\nFour.\n\nMore.',
    );
  });

  it('applies a diff that adds a binary file', async () => {
    const repo = consumer();
    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x01, 0x02, 0xff]);
    writeFileSync(join(repo.root, '.agents/skills/oak-alpha/references/diagram.png'), image);
    const remote = central();
    const github = fakeGitHub(remote);
    const result = await run(repo.root, github, { message: 'Add a diagram' }).promise;
    expect(result.conflicted).toBe(false);
    const added = execFileSync(
      'git',
      [
        'show',
        `${github.pullRequests[0]?.head ?? ''}:skills/central/oak-alpha/references/diagram.png`,
      ],
      { cwd: remote.remote, env: isolatedGitEnv },
    );
    expect(added.equals(image)).toBe(true);
  });

  it('applies cleanly when main has changed elsewhere in the skill since the release', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const remote = central();
    remote.commitToMain(
      { 'skills/central/oak-alpha/references/guide.md': '# Alpha guide\n\nRewritten on main.\n' },
      'docs: rewrite',
    );
    const github = fakeGitHub(remote);
    const result = await run(repo.root, github).promise;
    expect(result.conflicted).toBe(false);
    const head = github.pullRequests[0]?.head ?? '';
    expect(remote.read(head, 'skills/central/oak-alpha/SKILL.md')).toContain('first.');
    expect(remote.read(head, 'skills/central/oak-alpha/references/guide.md')).toContain(
      'Rewritten on main.',
    );
  });

  it('opens a draft with the conflict marked when main changed the same lines', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const remote = central();
    const onMain = readFileSync(
      join(packageFixture, 'skills/central/oak-alpha/SKILL.md'),
      'utf8',
    ).replace(
      'Read [the guide](references/guide.md).',
      'Always read [the guide](references/guide.md).',
    );
    remote.commitToMain(
      { 'skills/central/oak-alpha/SKILL.md': onMain },
      'docs: change the same line',
    );
    const github = fakeGitHub(remote);
    const result = await run(repo.root, github).promise;
    expect(result.conflicted).toBe(true);
    expect(github.pullRequests[0]?.draft).toBe(true);
    expect(github.pullRequests[0]?.body).toContain("This change didn't apply cleanly to `main`");
    const skill = remote.read(
      github.pullRequests[0]?.head ?? '',
      'skills/central/oak-alpha/SKILL.md',
    );
    expect(skill).toMatch(/^<<<<<<< /m);
    expect(skill).toContain('first.');
    expect(skill).toContain('Always read');
  });

  it('stops when the skill was deleted on main, so the change has nowhere to go', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const remote = central();
    remote.commitToMain({ 'skills/central/oak-alpha': null }, 'feat!: remove oak-alpha');
    await expect(run(repo.root, fakeGitHub(remote)).promise).rejects.toThrow(
      "The change couldn't be applied to the central repository",
    );
    expect(repo.git('status', '--porcelain')).toBe(`M ${ALPHA}`);
  });

  it('stops when the release tag is missing', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const pkg = copyPackage();
    cleanups.push(() => {
      removeTree(pkg);
    });
    await expect(run(repo.root, fakeGitHub(central('9.9.9'))).promise).rejects.toThrow(
      'The central repository has no release tag v1.2.3',
    );
  });

  it.each([
    ['minor', 'feat(oak-alpha): say to read the guide first', 'minor'],
    ['major', 'feat(oak-alpha)!: say to read the guide first', 'major'],
  ] as const)('titles and records a %s change', async (bump, title, recorded) => {
    const repo = consumer();
    editAlpha(repo.root);
    const remote = central();
    const github = fakeGitHub(remote);
    await run(repo.root, github, { bump }).promise;
    expect(github.pullRequests[0]?.title).toBe(title);
    const changeset = remote.read(
      github.pullRequests[0]?.head ?? '',
      `.changeset/promote-oak-alpha-${String(NOW.getTime())}.md`,
    );
    expect(changeset).toContain(`'@oaknational/oak-agent-skills': ${recorded}`);
  });

  it('records a breaking change as minor before version 1.0.0', async () => {
    const pkg = copyPackage();
    cleanups.push(() => {
      removeTree(pkg);
    });
    setPackageVersion(pkg, '0.4.0');
    const repo = consumer(pkg);
    editAlpha(repo.root);
    const remote = central('0.4.0', pkg);
    const github = fakeGitHub(remote);
    await run(repo.root, github, { bump: 'major' }, pkg).promise;
    expect(github.pullRequests[0]?.title).toBe('feat(oak-alpha)!: say to read the guide first');
    expect(
      remote.read(
        github.pullRequests[0]?.head ?? '',
        `.changeset/promote-oak-alpha-${String(NOW.getTime())}.md`,
      ),
    ).toContain("'@oaknational/oak-agent-skills': minor");
  });

  it('gives a title that passes the central repository commitlint check', () => {
    const title = pullRequestTitle('oak-alpha', 'major', 'Remove the old checklist.');
    const result = spawnSync(join(repoRoot, 'node_modules/.bin/commitlint'), [], {
      cwd: repoRoot,
      input: `${title}\n`,
      encoding: 'utf8',
    });
    expect(title).toBe('feat(oak-alpha)!: remove the old checklist');
    expect(result.status).toBe(0);
  });
});

describe('promote --new, 6.8', () => {
  it("proposes a draft for the repository's bundle, then removes the local draft", async () => {
    const repo = consumer();
    writeTree(repo.root, {
      '.agents/skills/owa-content/SKILL.md': skillText({ name: 'owa-content' }),
      '.agents/skills/owa-content/references/notes.md': '# Notes\n',
    });
    const remote = central();
    const github = fakeGitHub(remote);
    const result = await run(repo.root, github, {
      name: 'owa-content',
      isNew: true,
      bump: undefined,
      message: 'Add content guidance',
    }).promise;
    expect(result.change).toContain('.agents/skills/owa-content/references/notes.md');
    expect(result.bump).toBe('minor');
    const head = github.pullRequests[0]?.head ?? '';
    expect(github.pullRequests[0]?.title).toBe('feat(owa-content): add content guidance');
    expect(github.pullRequests[0]?.body).toContain('A new skill.');
    expect(remote.read(head, 'skills/repos/owa/owa-content/SKILL.md')).toContain(
      "updated: '2026-11-02'",
    );
    expect(remote.read(head, 'skills/repos/owa/owa-content/references/notes.md')).toBe('# Notes');
    expect(existsSync(join(repo.root, '.agents/skills/owa-content'))).toBe(false);
  });

  it('finds a draft written for Claude Code in .claude/skills/', async () => {
    const repo = consumer();
    writeTree(repo.root, { '.claude/skills/owa-draft/SKILL.md': skillText({ name: 'owa-draft' }) });
    const github = fakeGitHub(central());
    await run(repo.root, github, { name: 'owa-draft', isNew: true }).promise;
    expect(existsSync(join(repo.root, '.claude/skills/owa-draft'))).toBe(false);
  });

  it.each([
    ['no bundle is configured', { profiles: ['base'] }, 'owa-x', 'oakSkills names no bundle'],
    ['the name lacks the bundle prefix', undefined, 'oak-x', 'oak-x must start with "owa-"'],
    [
      'the name is already synced',
      undefined,
      'owa-routing',
      'owa-routing is already a synced skill',
    ],
    [
      'there is no draft',
      undefined,
      'owa-missing',
      "There's no draft skill at .agents/skills/owa-missing/",
    ],
  ])('stops when %s', async (_label, oakSkills, name, message) => {
    const repo = consumer(packageFixture, oakSkills ?? { profiles: ['base'], bundle: 'owa' });
    writeTree(repo.root, { [`.agents/skills/${name}/notes.md`]: 'x' });
    if (name === 'owa-missing') removeTree(join(repo.root, '.agents/skills/owa-missing'));
    await expect(
      run(repo.root, fakeGitHub(central()), { name, isNew: true }).promise,
    ).rejects.toThrow(message);
  });

  it('stops when the draft has no SKILL.md', async () => {
    const repo = consumer();
    writeTree(repo.root, { '.agents/skills/owa-x/notes.md': 'x' });
    await expect(
      run(repo.root, fakeGitHub(central()), { name: 'owa-x', isNew: true }).promise,
    ).rejects.toThrow('The draft at .agents/skills/owa-x has no SKILL.md.');
  });

  it('stops when the synced skills need attention first', async () => {
    const repo = consumer();
    writeTree(repo.root, { '.agents/skills/owa-x/SKILL.md': skillText({ name: 'owa-x' }) });
    setOakSkills(repo.root, { profiles: ['base', 'frontend'], bundle: 'owa' });
    await expect(
      run(repo.root, fakeGitHub(central()), { name: 'owa-x', isNew: true }).promise,
    ).rejects.toThrow('The synced skills need attention before promoting a new one.');
  });

  it('stops when the central repository already has the skill', async () => {
    const repo = consumer();
    writeTree(repo.root, { '.agents/skills/owa-x/SKILL.md': skillText({ name: 'owa-x' }) });
    const remote = central();
    const github = fakeGitHub(remote, {
      clone: (_repo, dir) => {
        spawnSync('git', ['clone', '--quiet', remote.remote, dir], { env: isolatedGitEnv });
        writeTree(dir, { 'skills/repos/owa/owa-x/SKILL.md': 'already here' });
      },
    });
    await expect(run(repo.root, github, { name: 'owa-x', isNew: true }).promise).rejects.toThrow(
      'The central repository already has skills/repos/owa/owa-x.',
    );
  });
});

describe('promote --new --bundle, the first skill of a new bundle', () => {
  const draft = (repo: TempRepo, name = 'ora-lint') => {
    writeTree(repo.root, {
      [`.agents/skills/${name}/SKILL.md`]: skillText({ name }),
    });
  };
  const noBundle = () => consumer(packageFixture, { profiles: ['base'] });

  it('proposes it under skills/repos/<code>/ with a CODEOWNERS line for the new folder', async () => {
    const repo = noBundle();
    draft(repo);
    const remote = central();
    const github = fakeGitHub(remote);
    const result = await run(repo.root, github, {
      name: 'ora-lint',
      isNew: true,
      bundle: 'ora',
      message: 'Add lint guidance',
    }).promise;
    const head = github.pullRequests[0]?.head ?? '';
    expect(result.newBundle).toBe('ora');
    expect(remote.read(head, 'skills/repos/ora/ora-lint/SKILL.md')).toContain('name: ora-lint');
    expect(remote.read(head, '.github/CODEOWNERS')).toBe(
      '/skills/repos/ora/ @oaknational/skills-maintainers',
    );
    expect(github.pullRequests[0]?.body).toContain('The first skill of a new bundle, `ora`.');
    expect(existsSync(join(repo.root, '.agents/skills/ora-lint'))).toBe(false);
  });

  it('adds the line to the end of an existing CODEOWNERS', async () => {
    const repo = noBundle();
    draft(repo);
    const remote = central();
    remote.commitToMain(
      { '.github/CODEOWNERS': '* @oaknational/skills-maintainers' },
      'chore: owners',
    );
    const github = fakeGitHub(remote);
    await run(repo.root, github, { name: 'ora-lint', isNew: true, bundle: 'ora' }).promise;
    expect(remote.read(github.pullRequests[0]?.head ?? '', '.github/CODEOWNERS')).toBe(
      '* @oaknational/skills-maintainers\n/skills/repos/ora/ @oaknational/skills-maintainers',
    );
  });

  it.each(['oak', 'longer', 'ORA', 'x', 'or4'])(
    'rejects --bundle %s with the usage exit code',
    async (code) => {
      const repo = noBundle();
      draft(repo);
      await expect(
        run(repo.root, fakeGitHub(central()), { name: 'ora-lint', isNew: true, bundle: code })
          .promise,
      ).rejects.toThrow(
        expect.objectContaining({
          message: `--bundle "${code}" isn't a repository code. Codes are two to four lowercase letters, such as "owa", and "oak" is reserved.`,
          exitCode: ExitCode.Usage,
        }),
      );
    },
  );

  it('stops when the installed package already has that bundle', async () => {
    const repo = noBundle();
    draft(repo, 'owa-x');
    await expect(
      run(repo.root, fakeGitHub(central()), { name: 'owa-x', isNew: true, bundle: 'owa' }).promise,
    ).rejects.toThrow(
      expect.objectContaining({
        message: 'The installed package already has the "owa" bundle.',
        hint: expect.stringContaining('Set oakSkills.bundle to "owa"') as unknown,
      }),
    );
  });

  it('stops when --bundle differs from the bundle oakSkills names', async () => {
    const repo = consumer();
    draft(repo, 'ora-x');
    await expect(
      run(repo.root, fakeGitHub(central()), { name: 'ora-x', isNew: true, bundle: 'ora' }).promise,
    ).rejects.toThrow(
      expect.objectContaining({
        message: 'oakSkills already names the bundle "owa", so --bundle "ora" doesn\'t apply.',
        exitCode: ExitCode.Usage,
      }),
    );
  });

  it('accepts --bundle when it matches the bundle oakSkills names', async () => {
    const repo = consumer();
    draft(repo, 'owa-x');
    const github = fakeGitHub(central());
    const result = await run(repo.root, github, { name: 'owa-x', isNew: true, bundle: 'owa' })
      .promise;
    expect(result.newBundle).toBeUndefined();
    expect(github.pullRequests[0]?.body).toContain('A new skill.');
  });

  it('suggests --bundle when oakSkills names no bundle', async () => {
    const repo = noBundle();
    draft(repo);
    await expect(
      run(repo.root, fakeGitHub(central()), { name: 'ora-lint', isNew: true }).promise,
    ).rejects.toThrow(
      expect.objectContaining({ hint: expect.stringContaining('pass --bundle') as unknown }),
    );
  });

  it('stops when the central repository already has the new bundle', async () => {
    const repo = noBundle();
    draft(repo);
    const remote = central();
    const github = fakeGitHub(remote, {
      clone: (_repo, dir) => {
        spawnSync('git', ['clone', '--quiet', remote.remote, dir], { env: isolatedGitEnv });
        writeTree(dir, { 'skills/repos/ora/ora-lint/SKILL.md': 'already here' });
      },
    });
    await expect(
      run(repo.root, github, { name: 'ora-lint', isNew: true, bundle: 'ora' }).promise,
    ).rejects.toThrow('The central repository already has skills/repos/ora/ora-lint.');
  });
});

describe('promote --new with drafts in both skills folders', () => {
  it('stops, and removes nothing, when the two drafts differ', async () => {
    const repo = consumer();
    writeTree(repo.root, {
      '.agents/skills/owa-x/SKILL.md': skillText({ name: 'owa-x' }),
      '.claude/skills/owa-x/SKILL.md': skillText({ name: 'owa-x', description: 'Another draft.' }),
    });
    const github = fakeGitHub(central());
    await expect(run(repo.root, github, { name: 'owa-x', isNew: true }).promise).rejects.toThrow(
      'There are different drafts of owa-x in .agents/skills/ and .claude/skills/, and promote proposes only one.',
    );
    expect(github.cloned).toBe(0);
    expect(existsSync(join(repo.root, '.agents/skills/owa-x/SKILL.md'))).toBe(true);
    expect(existsSync(join(repo.root, '.claude/skills/owa-x/SKILL.md'))).toBe(true);
  });

  it('proposes one copy and removes both when the drafts are the same', async () => {
    const repo = consumer();
    const text = skillText({ name: 'owa-x' });
    writeTree(repo.root, {
      '.agents/skills/owa-x/SKILL.md': text,
      '.claude/skills/owa-x/SKILL.md': text,
    });
    await run(repo.root, fakeGitHub(central()), { name: 'owa-x', isNew: true }).promise;
    expect(existsSync(join(repo.root, '.agents/skills/owa-x'))).toBe(false);
    expect(existsSync(join(repo.root, '.claude/skills/owa-x'))).toBe(false);
  });
});

describe('promote and files git ignores', () => {
  const filesOn = (remote: CentralRemote, ref: string) =>
    execFileSync('git', ['ls-tree', '-r', '--name-only', ref], {
      cwd: remote.remote,
      env: isolatedGitEnv,
      encoding: 'utf8',
    });

  it('leaves them out of the diff and the pull request, and names them when it restores the copy', async () => {
    const repo = consumer();
    writeTree(repo.root, {
      '.gitignore': '*.local.*\n',
      '.agents/skills/oak-alpha/notes.local.md': 'private\n',
    });
    editAlpha(repo.root);
    const remote = central();
    const github = fakeGitHub(remote);
    const preview = await run(repo.root, github, { dryRun: true }).promise;
    expect(preview.change).toContain('+Read [the guide](references/guide.md) first.');
    expect(preview.change).not.toContain('notes.local.md');
    expect(preview.deletedIgnored).toEqual(['.agents/skills/oak-alpha/notes.local.md']);
    expect(existsSync(join(repo.root, '.agents/skills/oak-alpha/notes.local.md'))).toBe(true);

    const result = await run(repo.root, github).promise;
    const head = github.pullRequests[0]?.head ?? '';
    expect(remote.read(head, 'skills/central/oak-alpha/SKILL.md')).toContain('first.');
    expect(filesOn(remote, head)).not.toContain('notes.local.md');
    expect(result.deletedIgnored).toEqual(['.agents/skills/oak-alpha/notes.local.md']);
    expect(existsSync(join(repo.root, '.agents/skills/oak-alpha/notes.local.md'))).toBe(false);
  });

  it('leaves them out of a new skill, and names them when it removes the draft', async () => {
    const repo = consumer();
    writeTree(repo.root, {
      '.gitignore': '*.local.*\n',
      '.agents/skills/owa-x/SKILL.md': skillText({ name: 'owa-x' }),
      '.agents/skills/owa-x/notes.local.md': 'private\n',
    });
    const remote = central();
    const github = fakeGitHub(remote);
    const result = await run(repo.root, github, { name: 'owa-x', isNew: true }).promise;
    const head = github.pullRequests[0]?.head ?? '';
    expect(result.change).not.toContain('notes.local.md');
    expect(filesOn(remote, head)).toContain('skills/repos/owa/owa-x/SKILL.md');
    expect(filesOn(remote, head)).not.toContain('notes.local.md');
    expect(result.deletedIgnored).toEqual(['.agents/skills/owa-x/notes.local.md']);
  });

  it('treats two drafts as the same when they differ only in files git ignores', async () => {
    const repo = consumer();
    const text = skillText({ name: 'owa-x' });
    writeTree(repo.root, {
      '.gitignore': '*.local.*\n',
      '.agents/skills/owa-x/SKILL.md': text,
      '.claude/skills/owa-x/SKILL.md': text,
      '.claude/skills/owa-x/notes.local.md': 'private\n',
    });
    const result = await run(repo.root, fakeGitHub(central()), { name: 'owa-x', isNew: true })
      .promise;
    expect(result.deletedIgnored).toEqual(['.claude/skills/owa-x/notes.local.md']);
    expect(existsSync(join(repo.root, '.claude/skills/owa-x'))).toBe(false);
  });
});

describe('promote and GitHub failures', () => {
  const branches = (remote: CentralRemote) =>
    execFileSync('git', ['ls-remote', '--heads', remote.remote, 'promote/*'], {
      env: isolatedGitEnv,
      encoding: 'utf8',
    }).trim();

  it('checks gh before asking anything', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const asked: string[] = [];
    const github = fakeGitHub(central(), { problem: () => 'gh is not signed in.' });
    await expect(
      promote(
        {
          cwd: repo.root,
          github,
          prompt: (question) => {
            asked.push(question);
            return Promise.resolve('');
          },
          packageDir: packageFixture,
          now: NOW,
          log: () => undefined,
        },
        options({ message: undefined, bump: undefined }),
      ),
    ).rejects.toThrow('gh is not signed in.');
    expect(asked).toEqual([]);
  });

  it('pushes nothing when the pull request template cannot be read', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const remote = central();
    const github = fakeGitHub(remote, {
      pullRequestTemplate: () => {
        throw new Error('gh api failed: HTTP 502');
      },
    });
    await expect(run(repo.root, github).promise).rejects.toThrow('HTTP 502');
    expect(github.cloned).toBe(0);
    expect(branches(remote)).toBe('');
  });

  it('deletes its branch again, and changes nothing here, when the pull request fails', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const remote = central();
    const github = fakeGitHub(remote, {
      createPullRequest: () => {
        throw new Error('gh pr create failed: HTTP 502');
      },
    });
    await expect(run(repo.root, github).promise).rejects.toThrow(
      expect.objectContaining({
        message: expect.stringContaining(
          "couldn't open the pull request: gh pr create failed",
        ) as unknown,
        hint: expect.stringContaining('It deleted the branch again') as unknown,
      }),
    );
    expect(branches(remote)).toBe('');
    expect(repo.git('status', '--porcelain')).toBe(`M ${ALPHA}`);
  });
});

describe('promote prompts', () => {
  function withPrompt(root: string, answers: string[], overrides: Partial<PromoteOptions> = {}) {
    const asked: string[] = [];
    const log: string[] = [];
    const promise = promote(
      {
        cwd: root,
        github: fakeGitHub(central()),
        prompt: (question) => {
          asked.push(question);
          return Promise.resolve(answers.shift() ?? '');
        },
        packageDir: packageFixture,
        now: NOW,
        log: (text) => log.push(text),
      },
      options({ message: undefined, bump: undefined, dryRun: true, ...overrides }),
    );
    return { asked, log, promise };
  }

  it('asks for the reason and the bump, showing the rules', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    const { asked, promise } = withPrompt(repo.root, ['Explain the guide', 'minor']);
    await expect(promise).resolves.toMatchObject({
      bump: 'minor',
      title: 'feat(oak-alpha): explain the guide',
    });
    expect(asked[1]).toContain('patch  Wording changes');
    expect(asked[1]).toContain('Bump [patch]: ');
  });

  it('defaults the bump when the answer is empty', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    await expect(withPrompt(repo.root, ['Explain the guide', '']).promise).resolves.toMatchObject({
      bump: 'patch',
    });
  });

  it('rejects an answer that is not a bump', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    await expect(withPrompt(repo.root, ['Explain', 'huge']).promise).rejects.toThrow(
      '"huge" isn\'t a version bump.',
    );
  });

  it('rejects an empty reason', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    await expect(withPrompt(repo.root, ['  ']).promise).rejects.toThrow(
      expect.objectContaining({
        exitCode: ExitCode.Usage,
        message: 'promote needs a reason for the change.',
      }),
    );
  });

  it('needs --message when there is no terminal, and uses the default bump with a note', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    await expect(
      run(repo.root, fakeGitHub(central()), { message: undefined, dryRun: true }).promise,
    ).rejects.toThrow('promote needs a reason for the change.');
    const { log, promise } = run(repo.root, fakeGitHub(central()), {
      bump: undefined,
      dryRun: true,
    });
    await expect(promise).resolves.toMatchObject({ bump: 'patch' });
    expect(log).toEqual(['Using a patch version bump. Pass --bump to choose another.']);
  });

  it('rejects a reason that makes the title too long', async () => {
    const repo = consumer();
    editAlpha(repo.root);
    await expect(
      run(repo.root, fakeGitHub(central()), { message: 'x'.repeat(90), dryRun: true }).promise,
    ).rejects.toThrow('over 100');
  });
});

describe('promote helpers', () => {
  it.each([
    ["  updated: '2025-06-01'", "  updated: '2026-11-02'"],
    ['  updated: 2025-06-01', "  updated: '2026-11-02'"],
  ])('sets an existing date: %s', (line, expected) => {
    expect(
      setUpdatedDate(
        `---\nname: x\nmetadata:\n${line}\n---\n# Body\nupdated: in the body\n`,
        '2026-11-02',
      ),
    ).toBe(`---\nname: x\nmetadata:\n${expected}\n---\n# Body\nupdated: in the body\n`);
  });

  it('adds the date to metadata, or adds metadata, when missing', () => {
    expect(setUpdatedDate('---\nname: x\nmetadata:\n  owner: y\n---\n', '2026-11-02')).toBe(
      "---\nname: x\nmetadata:\n  updated: '2026-11-02'\n  owner: y\n---\n",
    );
    expect(setUpdatedDate('---\nname: x\n---\n', '2026-11-02')).toBe(
      "---\nname: x\nmetadata:\n  updated: '2026-11-02'\n---\n",
    );
    expect(setUpdatedDate('No frontmatter', '2026-11-02')).toBe('No frontmatter');
  });

  it('keeps "$" patterns in a description as they are when setting the date', () => {
    expect(
      setUpdatedDate(
        "---\nname: x\ndescription: Costs $& more than $1\nmetadata:\n  updated: '2025-06-01'\n---\n",
        '2026-11-02',
      ),
    ).toBe(
      "---\nname: x\ndescription: Costs $& more than $1\nmetadata:\n  updated: '2026-11-02'\n---\n",
    );
  });

  it('puts the reason into the template as literal text', () => {
    const body = fillTemplate(
      readFileSync(join(repoRoot, '.github/pull_request_template.md'), 'utf8'),
      {
        reason: 'Costs $& more than $1',
        skillPath: 'skills/central/x',
        origin: 'o/r',
        note: '> [!NOTE]\n> Costs $& more than $1',
      },
    );
    expect(body).toContain(
      '## What changed and why\n\n> [!NOTE]\n> Costs $& more than $1\n\nCosts $& more than $1\n\n## Skills affected',
    );
  });

  it("puts promote's details first when the template is unrecognised", () => {
    expect(
      fillTemplate('# Our own template\n', {
        reason: 'Why',
        skillPath: 'skills/central/x',
        origin: 'o/r',
        note: 'Note',
      }),
    ).toBe('Note\n\nWhy\n\nSkill: skills/central/x\nOriginating-Repo: o/r\n\n# Our own template\n');
    expect(
      fillTemplate('', { reason: 'Why', skillPath: 's', origin: 'o/r', note: undefined }),
    ).toBe('Why\n\nSkill: s\nOriginating-Repo: o/r\n\n');
  });

  it.each([
    ['git@github.com:oaknational/Oak-Web-Application.git', 'oaknational/Oak-Web-Application'],
    ['https://github.com/oaknational/oak-components.git', 'oaknational/oak-components'],
    ['https://github.com/oaknational/oak-components', 'oaknational/oak-components'],
    ['https://gitlab.example/x/y.git', undefined],
  ])('finds the originating repository from the remote %s', (url, expected) => {
    const repo = createTempRepo('single-package');
    cleanups.push(repo.cleanup);
    repo.git('remote', 'add', 'origin', url);
    expect(originatingRepo(repo.root)).toBe(expected ?? repo.root.split('/').pop());
  });

  it('falls back to the folder name without a remote', () => {
    const repo = createTempRepo('single-package');
    cleanups.push(repo.cleanup);
    expect(originatingRepo(repo.root)).toBe(repo.root.split('/').pop());
  });
});
