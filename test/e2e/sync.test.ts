import { existsSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setOakSkills } from '../helpers/consumer.ts';
import { installPackage, runInstalled } from '../helpers/installed.ts';
import { createTempRepo, type FixtureName, type TempRepo } from '../helpers/temp-repo.ts';
import { writeTree } from '../helpers/tree.ts';

const repos: TempRepo[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});

function installedIn(
  fixture: FixtureName,
  oakSkills: unknown = { profiles: ['base'], bundle: 'owa' },
) {
  const repo = createTempRepo(fixture);
  repos.push(repo);
  setOakSkills(repo.root, oakSkills);
  const cli = installPackage(repo.root);
  repo.git('add', '--all');
  repo.git('commit', '--quiet', '--message', 'chore: install oak-skills');
  return { repo, cli };
}

describe.each<FixtureName>(['single-package', 'settings-only-workspace', 'workspace'])(
  'the built oak-skills sync, in the %s fixture',
  (fixture) => {
    it('syncs, then changes nothing on a second run', () => {
      const { repo, cli } = installedIn(fixture);
      const first = runInstalled(cli, repo.root, 'sync');
      expect(first).toMatchObject({ code: 0, err: '' });
      expect(first.out).toContain('Synced 3 skills from version 1.2.3.');
      expect(readlinkSync(join(repo.root, '.claude/skills/owa-routing'))).toBe(
        '../../.agents/skills/owa-routing',
      );

      repo.git('add', '--all');
      repo.git('commit', '--quiet', '--message', 'chore: sync agent skills');
      const second = runInstalled(cli, repo.root, 'sync');
      expect(second).toEqual({
        code: 0,
        out: 'Already up to date: 3 skills from version 1.2.3.\n',
        err: '',
      });
      expect(repo.git('status', '--porcelain')).toBe('');
    });

    it('prints the plan on a dry run and changes nothing', () => {
      const { repo, cli } = installedIn(fixture);
      const result = runInstalled(cli, repo.root, 'sync', '--dry-run');
      expect(result.code).toBe(0);
      expect(result.out).toContain('Would add oak-alpha');
      expect(result.out).toContain('Dry run: nothing was changed.');
      expect(repo.git('status', '--porcelain')).toBe('');
    });

    it('exits 5 on an unknown profile', () => {
      const { repo, cli } = installedIn(fixture, { profiles: ['nope'] });
      const result = runInstalled(cli, repo.root, 'sync');
      expect(result.code).toBe(5);
      expect(result.err).toContain('unknown profile "nope"');
    });

    it('exits 4 when an unmanaged folder blocks a skill', () => {
      const { repo, cli } = installedIn(fixture);
      writeTree(repo.root, { '.agents/skills/oak-alpha/SKILL.md': 'not ours' });
      expect(runInstalled(cli, repo.root, 'sync').code).toBe(4);
    });
  },
);

describe('the built oak-skills sync in a workspace package folder', () => {
  it('writes the skills at the repository root', () => {
    const { repo, cli } = installedIn('workspace');
    expect(runInstalled(cli, join(repo.root, 'packages/ui'), 'sync').code).toBe(0);
    expect(existsSync(join(repo.root, '.agents/skills/oak-alpha/SKILL.md'))).toBe(true);
    expect(existsSync(join(repo.root, 'packages/ui/.agents'))).toBe(false);
  });
});

describe('the built oak-skills sync --json', () => {
  it('prints machine-readable output', () => {
    const { repo, cli } = installedIn('single-package');
    const result = runInstalled(cli, repo.root, 'sync', '--json', '--dry-run');
    expect(JSON.parse(result.out)).toMatchObject({
      dryRun: true,
      added: ['oak-alpha', 'oak-beta', 'owa-routing'],
    });
  });
});
