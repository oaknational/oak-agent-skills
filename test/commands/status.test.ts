import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../../src/run.ts';
import { applySync, planSync } from '../../src/lib/sync.ts';
import { capture } from '../helpers/capture.ts';
import { setOakSkills } from '../helpers/consumer.ts';
import { packageFixture } from '../helpers/paths.ts';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.ts';
import { writeTree } from '../helpers/tree.ts';

const repos: TempRepo[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});

function synced(): TempRepo {
  const repo = createTempRepo('single-package');
  repos.push(repo);
  setOakSkills(repo.root, { profiles: ['base'] });
  applySync(planSync(repo.root, packageFixture));
  return repo;
}

async function status(cwd: string, ...flags: string[]) {
  const captured = capture();
  const code = await run(['status', ...flags], captured.output, {
    cwd,
    packageDir: packageFixture,
  });
  return { code, out: captured.out(), err: captured.err() };
}

describe('oak-skills status', () => {
  it('reports a clean repository', async () => {
    const { root } = synced();
    expect(await status(root)).toEqual({
      code: 0,
      out: [
        'oak-skills 1.2.3. Skills synced from version 1.2.3.',
        'Clean: oak-alpha, oak-beta',
        'Status: clean (exit code 0)',
      ].join('\n'),
      err: '',
    });
  });

  it('lists every problem by kind', async () => {
    const { root } = synced();
    writeFileSync(join(root, '.agents/skills/oak-alpha/SKILL.md'), 'edited');
    writeTree(root, { '.agents/skills/notes/SKILL.md': 'x' });
    setOakSkills(root, { profiles: ['base', 'frontend'] });
    expect((await status(root)).out).toBe(
      [
        'oak-skills 1.2.3. Skills synced from version 1.2.3.',
        'Out of date:',
        "  oakSkills now includes oak-gamma, which isn't synced.",
        'Edited:',
        '  .agents/skills/oak-alpha/SKILL.md',
        'Unmanaged:',
        '  .agents/skills/notes',
        'Clean: oak-beta',
        'Status: unmanaged files (exit code 4)',
      ].join('\n'),
    );
  });

  it('reports configuration problems, and says when nothing has been synced', async () => {
    const repo = createTempRepo('single-package');
    repos.push(repo);
    setOakSkills(repo.root, { profiles: ['nope'] });
    const result = await status(repo.root);
    expect(result.code).toBe(5);
    expect(result.out).toContain('oak-skills 1.2.3. No skills have been synced yet.');
    expect(result.out).toContain(
      'Configuration problems:\n  oakSkills in package.json: unknown profile "nope"',
    );
    expect(result.out).toContain('Status: configuration problem (exit code 5)');
  });

  it('prints JSON with --json', async () => {
    const { root } = synced();
    writeFileSync(join(root, '.agents/skills/oak-beta/SKILL.md'), 'edited');
    const result = await status(root, '--json');
    expect(result.code).toBe(1);
    expect(JSON.parse(result.out)).toEqual({
      status: 'edited',
      exitCode: 1,
      toolVersion: '1.2.3',
      syncedVersion: '1.2.3',
      clean: ['oak-alpha'],
      edited: ['.agents/skills/oak-beta/SKILL.md'],
      outOfDate: [],
      unmanaged: [],
      configProblems: [],
    });
  });

  it('gives null for the synced version in JSON before the first sync', async () => {
    const repo = createTempRepo('single-package');
    repos.push(repo);
    setOakSkills(repo.root, { profiles: ['base'] });
    expect(JSON.parse((await status(repo.root, '--json')).out)).toMatchObject({
      syncedVersion: null,
      exitCode: 2,
    });
  });

  it('changes nothing', async () => {
    const repo = synced();
    repo.git('add', '--all');
    repo.git('commit', '--quiet', '--message', 'chore: sync');
    writeFileSync(join(repo.root, '.agents/skills/oak-beta/SKILL.md'), 'edited');
    const before = repo.git('status', '--porcelain');
    await status(repo.root);
    expect(repo.git('status', '--porcelain')).toBe(before);
  });
});
