import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { setOakSkills } from '../helpers/consumer.ts';
import { installPackage, runInstalled } from '../helpers/installed.ts';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.ts';

const repos: TempRepo[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});

function synced() {
  const repo = createTempRepo('single-package');
  repos.push(repo);
  setOakSkills(repo.root, { profiles: ['base'] });
  const cli = installPackage(repo.root);
  expect(runInstalled(cli, repo.root, 'sync').code).toBe(0);
  return { repo, run: (...args: string[]) => runInstalled(cli, repo.root, ...args) };
}

describe('the built oak-skills promote', () => {
  it('prints the diff against the installed package on a dry run, and changes nothing', () => {
    const { repo, run } = synced();
    const file = join(repo.root, '.agents/skills/oak-beta/SKILL.md');
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace('Beta guidance.', 'Clearer beta guidance.'),
    );
    const before = repo.git('status', '--porcelain');
    const result = run(
      'promote',
      'oak-beta',
      '--dry-run',
      '--bump',
      'patch',
      '--message',
      'Clarify the guidance',
    );
    expect(result.code).toBe(0);
    expect(result.out).toContain('-Beta guidance.');
    expect(result.out).toContain('+Clearer beta guidance.');
    expect(result.out).toContain('fix(oak-beta): clarify the guidance');
    expect(repo.git('status', '--porcelain')).toBe(before);
  });

  it('exits 1 when there is nothing to promote', () => {
    const { run } = synced();
    const result = run('promote', 'oak-beta', '--dry-run', '--message', 'x');
    expect(result.code).toBe(1);
    expect(result.err).toContain("oak-beta hasn't been edited");
  });

  it('exits 64 without a reason when there is no terminal to ask on', () => {
    const { repo, run } = synced();
    writeFileSync(join(repo.root, '.agents/skills/oak-beta/SKILL.md'), 'edited');
    expect(run('promote', 'oak-beta', '--dry-run').code).toBe(64);
  });
});
