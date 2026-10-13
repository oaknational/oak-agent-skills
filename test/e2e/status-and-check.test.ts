import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { copyPackage, setOakSkills, setPackageVersion } from '../helpers/consumer.ts';
import { INSTALLED_DIR, installPackage, runInstalled } from '../helpers/installed.ts';
import { createTempRepo, type FixtureName } from '../helpers/temp-repo.ts';
import { removeTree, writeTree } from '../helpers/tree.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function packageAt(version: string): string {
  const dir = copyPackage();
  cleanups.push(() => {
    removeTree(dir);
  });
  setPackageVersion(dir, version);
  return dir;
}

// A repository that installed and synced the package, then committed the result.
function syncedRepo(fixture: FixtureName, packageDir?: string) {
  const repo = createTempRepo(fixture);
  cleanups.push(repo.cleanup);
  setOakSkills(repo.root, { profiles: ['base'], bundle: 'owa' });
  let cli = installPackage(repo.root, packageDir);
  expect(runInstalled(cli, repo.root, 'sync').code).toBe(0);
  repo.git('add', '--all');
  repo.git('commit', '--quiet', '--message', 'chore: sync agent skills');
  const reinstall = (dir: string) => {
    removeTree(join(repo.root, INSTALLED_DIR));
    cli = installPackage(repo.root, dir);
  };
  return { repo, run: (...args: string[]) => runInstalled(cli, repo.root, ...args), reinstall };
}

describe.each<FixtureName>(['single-package', 'settings-only-workspace', 'workspace'])(
  'the built status and check, in the %s fixture',
  (fixture) => {
    it('exit code 0 when clean', () => {
      const { run } = syncedRepo(fixture);
      expect(run('status').code).toBe(0);
      expect(run('check')).toMatchObject({
        code: 0,
        out: 'oak-skills check passed: 3 skills match version 1.2.3.\n',
      });
    });

    it('exit code 1 when a synced skill was edited', () => {
      const { repo, run } = syncedRepo(fixture);
      writeFileSync(join(repo.root, '.agents/skills/owa-routing/SKILL.md'), 'edited');
      expect(run('status').code).toBe(1);
      const result = run('check');
      expect(result.code).toBe(1);
      expect(result.err).toContain('"oak-skills promote owa-routing"');
    });

    it('exit code 2 when a newer version is installed', () => {
      const { run, reinstall } = syncedRepo(fixture);
      reinstall(packageAt('1.3.0'));
      expect(run('status').code).toBe(2);
      expect(run('check').code).toBe(2);
    });

    it('exit code 2 when pinned to an older version', () => {
      const { run, reinstall } = syncedRepo(fixture, packageAt('1.3.0'));
      reinstall(packageAt('1.1.0'));
      expect(run('check')).toMatchObject({ code: 2 });
      expect(run('check').err).toContain(
        'synced from version 1.3.0, but version 1.1.0 is installed',
      );
    });

    it('exit code 3 when edited and out of date', () => {
      const { repo, run, reinstall } = syncedRepo(fixture);
      rmSync(join(repo.root, '.claude/skills/oak-alpha'));
      reinstall(packageAt('2.0.0'));
      expect(run('check').code).toBe(3);
    });

    it('exit code 4 for an unmanaged folder', () => {
      const { repo, run } = syncedRepo(fixture);
      writeTree(repo.root, { '.claude/skills/old-local-skill/SKILL.md': 'x' });
      expect(run('status').code).toBe(4);
      expect(run('check').code).toBe(4);
    });

    it('exit code 5 for an unknown profile', () => {
      const { repo, run } = syncedRepo(fixture);
      setOakSkills(repo.root, { profiles: ['nope'] });
      expect(run('status').code).toBe(5);
      expect(run('check').code).toBe(5);
    });

    it('exit code 6 from check when AGENTS.md files pass 32 KiB on a path', () => {
      const { repo, run } = syncedRepo(fixture);
      writeTree(repo.root, { 'AGENTS.md': 'x'.repeat(33_000) });
      expect(run('check').code).toBe(6);
      expect(run('status').code).toBe(0);
    });

    it('changes nothing, however often it runs', () => {
      const { repo, run } = syncedRepo(fixture);
      writeFileSync(join(repo.root, '.agents/skills/oak-beta/SKILL.md'), 'edited');
      const before = repo.git('status', '--porcelain');
      run('status');
      run('check');
      run('check');
      expect(repo.git('status', '--porcelain')).toBe(before);
    });
  },
);

describe('the built status --json', () => {
  it('prints machine-readable output', () => {
    const { run } = syncedRepo('single-package');
    expect(JSON.parse(run('status', '--json').out)).toMatchObject({
      status: 'clean',
      exitCode: 0,
      syncedVersion: '1.2.3',
    });
  });
});

describe('the built check in a workspace package folder', () => {
  it('checks the skills at the repository root', () => {
    const { repo } = syncedRepo('workspace');
    const cli = join(repo.root, INSTALLED_DIR, 'dist/cli.js');
    expect(runInstalled(cli, join(repo.root, 'apps/web'), 'check').code).toBe(0);
  });
});
