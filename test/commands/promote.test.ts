import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GitHub } from '../../src/lib/github.ts';
import { applySync, planSync } from '../../src/lib/sync.ts';
import { run } from '../../src/run.ts';
import { capture } from '../helpers/capture.ts';
import { createCentralRemote, fakeGitHub, type CentralRemote } from '../helpers/central.ts';
import { setOakSkills } from '../helpers/consumer.ts';
import { packageFixture } from '../helpers/paths.ts';
import { createTempRepo, isolatedGitEnv, type TempRepo } from '../helpers/temp-repo.ts';
import { skillText, writeTree } from '../helpers/tree.ts';

const NOW = new Date('2026-11-02T10:00:00Z');
const cleanups: (() => void)[] = [];
beforeEach(() => {
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

function setUp(): { repo: TempRepo; remote: CentralRemote } {
  const repo = createTempRepo('single-package');
  cleanups.push(repo.cleanup);
  setOakSkills(repo.root, { profiles: ['base'], bundle: 'owa' });
  applySync(planSync(repo.root, packageFixture));
  const file = join(repo.root, '.agents/skills/oak-beta/SKILL.md');
  writeFileSync(
    file,
    readFileSync(file, 'utf8').replace('Beta guidance.', 'Better beta guidance.'),
  );
  const remote = createCentralRemote();
  cleanups.push(remote.cleanup);
  return { repo, remote };
}

async function promote(cwd: string, github: GitHub, ...args: string[]) {
  const captured = capture();
  const code = await run(['promote', ...args], captured.output, {
    cwd,
    packageDir: packageFixture,
    github,
    now: NOW,
  });
  return { code, out: captured.out(), err: captured.err() };
}

describe('oak-skills promote', () => {
  it.each([
    [[], 'promote needs exactly one skill name.'],
    [['oak-a', 'oak-b'], 'promote needs exactly one skill name.'],
    [['oak-beta', '--bump', 'huge'], '--bump must be patch, minor or major, not "huge".'],
  ])('rejects %j with the usage exit code', async (args, message) => {
    const { repo, remote } = setUp();
    const result = await promote(repo.root, fakeGitHub(remote), ...args);
    expect(result.code).toBe(64);
    expect(result.err).toContain(message);
  });

  it('prints the diff and the plan on a dry run', async () => {
    const { repo, remote } = setUp();
    const result = await promote(
      repo.root,
      fakeGitHub(remote),
      'oak-beta',
      '--dry-run',
      '--message',
      'Improve the guidance',
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain('+Better beta guidance.');
    expect(result.out).toContain(
      'Would open a pull request in oaknational/oak-agent-skills: "fix(oak-beta): improve the guidance"',
    );
    expect(result.out).toContain('Would add a patch changeset, and set metadata.updated to today.');
    expect(result.out).toContain(
      'Would then restore the synced copy of oak-beta here with "oak-skills sync".',
    );
    expect(result.out).toContain('Dry run: nothing was cloned, opened or changed.');
    expect(result.err).toBe('Using a patch version bump. Pass --bump to choose another.');
  });

  it('opens the pull request and says the copy was restored', async () => {
    const { repo, remote } = setUp();
    const result = await promote(
      repo.root,
      fakeGitHub(remote),
      'oak-beta',
      '--message',
      'Improve the guidance',
      '--bump',
      'patch',
    );
    expect(result).toEqual({
      code: 0,
      out: [
        'Opened a pull request: https://github.com/oaknational/oak-agent-skills/pull/1',
        'Restored the synced copy of oak-beta. Your change arrives with the next release once the pull request merges.',
      ].join('\n'),
      err: 'Cloning oaknational/oak-agent-skills...',
    });
  });

  it('says when it opened a draft because of a conflict', async () => {
    const { repo, remote } = setUp();
    remote.commitToMain(
      {
        'skills/central/oak-beta/SKILL.md': readFileSync(
          join(packageFixture, 'skills/central/oak-beta/SKILL.md'),
          'utf8',
        ).replace('Beta guidance.', 'Different beta guidance.'),
      },
      'docs: change beta',
    );
    const result = await promote(
      repo.root,
      fakeGitHub(remote),
      'oak-beta',
      '--message',
      'Improve it',
      '--bump',
      'patch',
    );
    expect(result.out).toContain('Opened a draft pull request:');
    expect(result.out).toContain("The change didn't apply cleanly to main");
  });

  it('describes a new skill on a dry run and after promoting it', async () => {
    const { repo, remote } = setUp();
    writeTree(repo.root, { '.agents/skills/owa-new/SKILL.md': skillText({ name: 'owa-new' }) });
    const dry = await promote(
      repo.root,
      fakeGitHub(remote),
      'owa-new',
      '--new',
      '--dry-run',
      '--message',
      'Add it',
    );
    expect(dry.out).toContain('New skill files:\n  .agents/skills/owa-new/SKILL.md');
    expect(dry.out).toContain('Would then remove the local draft of owa-new.');
    const result = await promote(
      repo.root,
      fakeGitHub(remote),
      'owa-new',
      '--new',
      '--message',
      'Add it',
    );
    expect(result.out).toContain('Removed the local draft of owa-new.');
  });
});
