import { execFileSync, spawnSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadDevDependencies } from '../../src/lib/validate/dev-dependencies.ts';
import { repoRoot } from '../helpers/paths.ts';
import { createTempRepo, isolatedGitEnv, type TempRepo } from '../helpers/temp-repo.ts';
import { makeTempDir, removeTree, writeTree } from '../helpers/tree.ts';

interface Step {
  name?: string;
  id?: string;
  uses?: string;
  run?: string;
  with?: Record<string, unknown>;
  env?: Record<string, string>;
}
interface Job {
  if?: string;
  permissions?: Record<string, string>;
  steps: Step[];
  'timeout-minutes'?: number;
}
interface Workflow {
  on: Record<string, unknown>;
  permissions: Record<string, string>;
  concurrency?: { 'cancel-in-progress'?: boolean };
  jobs: Record<string, Job>;
}

let sync: Workflow;
let check: Workflow;
beforeAll(async () => {
  const { yaml } = await loadDevDependencies();
  const load = (name: string) =>
    yaml.parse(readFileSync(join(repoRoot, 'templates/workflows', name), 'utf8')) as Workflow;
  sync = load('oak-skills-sync.yml');
  check = load('oak-skills-check.yml');
});

const allSteps = (workflow: Workflow) => Object.values(workflow.jobs).flatMap((job) => job.steps);

describe.each(['oak-skills-sync.yml', 'oak-skills-check.yml'])('the %s template', (name) => {
  const workflow = () => (name === 'oak-skills-sync.yml' ? sync : check);

  it('pins every action to a full commit hash', () => {
    for (const step of allSteps(workflow()).filter((s) => s.uses !== undefined)) {
      expect(step.uses).toMatch(/^[\w.-]+\/[\w.-]+@[0-9a-f]{40}$/);
    }
  });

  it('checks out without saving credentials, and has read-only defaults and timeouts', () => {
    for (const step of allSteps(workflow()).filter((s) =>
      s.uses?.startsWith('actions/checkout@'),
    )) {
      expect(step.with?.['persist-credentials']).toBe(false);
    }
    expect(workflow().permissions).toEqual({ contents: 'read' });
    for (const job of Object.values(workflow().jobs))
      expect(job['timeout-minutes']).toBeGreaterThan(0);
  });

  it('runs on pull_request only, never pull_request_target', () => {
    expect(Object.keys(workflow().on)).toEqual(['pull_request']);
  });

  it('installs with lifecycle scripts disabled', () => {
    for (const step of allSteps(workflow()).filter((s) => s.run?.includes('pnpm install'))) {
      expect(step.run).toContain('--frozen-lockfile --ignore-scripts');
    }
  });
});

describe('the sync template', () => {
  it("keeps secrets out of the job that runs the package's code", () => {
    expect(JSON.stringify(sync.jobs.sync)).not.toContain('secrets.');
    expect(sync.jobs.sync?.permissions).toBeUndefined();
  });

  it('never installs or runs package code in the job that holds the token', () => {
    const push = JSON.stringify(sync.jobs.push);
    expect(push).toContain('secrets.OAK_SKILLS_APP_CLIENT_ID');
    for (const forbidden of ['pnpm', 'npm ', 'npx', 'node ', 'setup-node', 'oak-skills sync']) {
      expect(push).not.toContain(forbidden);
    }
  });

  it('only runs for same-repository Dependabot pull requests, and skips runs the App starts', () => {
    expect(sync.jobs.detect?.if).toContain(
      "github.event.pull_request.user.login == 'dependabot[bot]'",
    );
    expect(sync.jobs.detect?.if).toContain(
      'github.event.pull_request.head.repo.full_name == github.repository',
    );
    expect(sync.jobs.detect?.if).toContain("github.actor == 'dependabot[bot]'");
  });

  it("doesn't cancel runs in progress, and asks for contents write only", () => {
    expect(sync.concurrency?.['cancel-in-progress']).toBe(false);
    const app = sync.jobs.push?.steps.find((step) => step.id === 'app');
    expect(app?.with).toMatchObject({ 'permission-contents': 'write' });
    expect(Object.keys(app?.with ?? {}).filter((key) => key.startsWith('permission-'))).toEqual([
      'permission-contents',
    ]);
  });
});

describe("the sync template's push job", () => {
  const repos: TempRepo[] = [];
  const dirs: string[] = [];
  afterEach(() => {
    for (const repo of repos.splice(0)) repo.cleanup();
    for (const dir of dirs.splice(0)) removeTree(dir);
  });

  const step = (name: string) => {
    const found = sync.jobs.push?.steps.find((s) => s.name === name);
    if (found?.run === undefined) throw new Error(`No step named ${name}`);
    return found;
  };

  function runStep(name: string, cwd: string, env: Record<string, string> = {}) {
    return spawnSync('bash', ['-eo', 'pipefail', '-c', step(name).run ?? ''], {
      cwd,
      encoding: 'utf8',
      // No author settings, so the step must set its own, as on a CI runner.
      env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', ...env },
    });
  }

  // A consuming repository at the pull request's head, plus the artifact the sync job uploaded.
  function prepare(artifact: (dir: string) => void): TempRepo {
    const repo = createTempRepo('single-package');
    repos.push(repo);
    writeTree(repo.root, {
      '.agents/skills/oak-old/SKILL.md': 'old',
      '.agents/skills/.oak-manifest.json': '{}',
    });
    mkdirSync(join(repo.root, '.claude/skills'), { recursive: true });
    symlinkSync('../../.agents/skills/oak-old', join(repo.root, '.claude/skills/oak-old'));
    repo.git('add', '--all');
    repo.git('commit', '--quiet', '--message', 'chore: before the update');
    expect(runStep('Clear the skills folder for the synced copy', repo.root).status).toBe(0);
    artifact(join(repo.root, '.agents/skills'));
    return repo;
  }

  const goodArtifact = (dir: string) => {
    writeTree(dir, {
      'oak-alpha/SKILL.md': 'alpha',
      'oak-alpha/references/a.md': 'a',
      '.oak-manifest.json': '{"v":2}',
    });
  };

  it('recreates the links for exactly the synced skills', () => {
    const repo = prepare(goodArtifact);
    const result = runStep('Check the synced copy and recreate the Claude Code links', repo.root);
    expect(result.status).toBe(0);
    expect(readlinkSync(join(repo.root, '.claude/skills/oak-alpha'))).toBe(
      '../../.agents/skills/oak-alpha',
    );
    expect(existsSync(join(repo.root, '.claude/skills/oak-old'))).toBe(false);
    expect(runStep('Confirm nothing outside the skill folders changed', repo.root).status).toBe(0);
  });

  it.each([
    [
      'a symlink',
      (dir: string) => {
        symlinkSync('/etc/passwd', join(dir, 'oak-alpha/leak'));
      },
    ],
    [
      'a symlinked skill folder',
      (dir: string) => {
        symlinkSync('/tmp', join(dir, 'oak-evil'));
      },
    ],
  ])('rejects an artifact holding %s', (_label, plant) => {
    const repo = prepare((dir) => {
      goodArtifact(dir);
      plant(dir);
    });
    const result = runStep('Check the synced copy and recreate the Claude Code links', repo.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('something other than files and folders');
  });

  it.each(['Bad_Name', '-option', 'spaces here', 'dots.in.name'])(
    'rejects a skill folder named "%s"',
    (name) => {
      const repo = prepare((dir) => {
        goodArtifact(dir);
        writeTree(dir, { [`${name}/SKILL.md`]: 'x' });
      });
      const result = runStep('Check the synced copy and recreate the Claude Code links', repo.root);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('Unexpected skill folder name');
    },
  );

  it('rejects changes outside the skill folders', () => {
    const repo = prepare(goodArtifact);
    writeFileSync(join(repo.root, 'package.json'), '{"name":"tampered"}');
    expect(
      runStep('Check the synced copy and recreate the Claude Code links', repo.root).status,
    ).toBe(0);
    const result = runStep('Confirm nothing outside the skill folders changed', repo.root);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('changed files outside .agents/skills and .claude/skills');
  });

  describe('the commit and push step', () => {
    // Stands in for gh, answering the bot user lookup, and points the push at a local remote.
    function commitAndPush(repo: TempRepo, botId = '41898282') {
      const bin = makeTempDir('bin');
      dirs.push(bin);
      writeFileSync(join(bin, 'gh'), `#!/bin/sh\necho '${botId}'\n`);
      chmodSync(join(bin, 'gh'), 0o755);
      const remote = makeTempDir('remote');
      dirs.push(remote);
      execFileSync('git', ['init', '--quiet', '--bare', remote], { env: isolatedGitEnv });
      const token = 'test-token';
      const repoName = 'oaknational/example';
      const result = runStep('Commit and push the synced skills', repo.root, {
        PATH: `${bin}:${process.env.PATH ?? ''}`,
        TOKEN: token,
        APP_SLUG: 'oak-skills-app',
        HEAD_REF: 'dependabot/npm_and_yarn/oak-agent-skills-1.3.0',
        REPO: repoName,
        GIT_CONFIG_COUNT: '1',
        GIT_CONFIG_KEY_0: `url.${remote}.insteadOf`,
        // The URL the step pushes to, which the line above redirects to the local remote.
        GIT_CONFIG_VALUE_0: `https://x-access-token:${token}@github.com/${repoName}.git`,
      });
      return { result, remote };
    }

    it('commits as the App bot with [dependabot skip], and pushes to the pull request branch', () => {
      const repo = prepare(goodArtifact);
      runStep('Check the synced copy and recreate the Claude Code links', repo.root);
      const { result, remote } = commitAndPush(repo);
      expect(result.status).toBe(0);
      const log = execFileSync(
        'git',
        ['log', '-1', '--format=%an|%ae|%s', 'dependabot/npm_and_yarn/oak-agent-skills-1.3.0'],
        { cwd: remote, encoding: 'utf8', env: isolatedGitEnv },
      ).trim();
      expect(log).toBe(
        'oak-skills-app[bot]|41898282+oak-skills-app[bot]@users.noreply.github.com|chore: sync agent skills [dependabot skip]',
      );
    });

    it('does nothing when the skills are already in sync', () => {
      const repo = prepare(goodArtifact);
      runStep('Check the synced copy and recreate the Claude Code links', repo.root);
      repo.git('add', '--all');
      repo.git('commit', '--quiet', '--message', 'chore: already synced');
      const { result } = commitAndPush(repo);
      expect(result.status).toBe(0);
      expect(result.stdout).toContain('The skills were already in sync.');
    });

    it('copes with a sync that leaves no skills, so .claude/skills is empty', () => {
      const repo = createTempRepo('single-package');
      repos.push(repo);
      expect(runStep('Clear the skills folder for the synced copy', repo.root).status).toBe(0);
      writeTree(repo.root, { '.agents/skills/.oak-manifest.json': '{}' });
      expect(
        runStep('Check the synced copy and recreate the Claude Code links', repo.root).status,
      ).toBe(0);
      expect(commitAndPush(repo).result.status).toBe(0);
    });

    it("stops if it can't find the App's bot user", () => {
      const repo = prepare(goodArtifact);
      runStep('Check the synced copy and recreate the Claude Code links', repo.root);
      const { result } = commitAndPush(repo, 'Not Found');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Couldn't find the App's bot user.");
    });
  });
});
