import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/lib/exit-codes.ts';
import { run } from '../../src/run.ts';
import { capture } from '../helpers/capture.ts';
import { setOakSkills } from '../helpers/consumer.ts';
import { packageFixture } from '../helpers/paths.ts';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.ts';
import { makeTempDir, removeTree, writeTree } from '../helpers/tree.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

const NO_SETTINGS = Symbol('no oakSkills settings');

function consumer(oakSkills: unknown = { profiles: ['base'] }): TempRepo {
  const repo = createTempRepo('single-package');
  cleanups.push(repo.cleanup);
  if (oakSkills !== NO_SETTINGS) setOakSkills(repo.root, oakSkills);
  return repo;
}

async function sync(cwd: string, ...flags: string[]) {
  const captured = capture();
  const code = await run(['sync', ...flags], captured.output, { cwd, packageDir: packageFixture });
  return { code, out: captured.out(), err: captured.err() };
}

describe('oak-skills sync', () => {
  it('reports what it added and linked', async () => {
    const { root } = consumer();
    expect(await sync(root)).toEqual({
      code: 0,
      out: [
        'Added oak-alpha',
        'Added oak-beta',
        'Linked .claude/skills/oak-alpha',
        'Linked .claude/skills/oak-beta',
        'Synced 2 skills from version 1.2.3.',
      ].join('\n'),
      err: '',
    });
  });

  it('says when everything is already up to date', async () => {
    const { root } = consumer({ profiles: [], include: ['oak-alpha'] });
    await sync(root);
    expect(await sync(root)).toEqual({
      code: 0,
      out: 'Already up to date: 1 skill from version 1.2.3.',
      err: '',
    });
  });

  it('reports updates, removals and unlinking', async () => {
    const { root } = consumer();
    await sync(root);
    writeFileSync(join(root, '.agents/skills/oak-alpha/SKILL.md'), 'edited');
    setOakSkills(root, { profiles: ['base'], exclude: ['oak-beta'] });
    const result = await sync(root);
    expect(result.code).toBe(0);
    expect(result.out).toBe(
      [
        'Updated oak-alpha',
        'Removed oak-beta',
        'Unlinked .claude/skills/oak-beta',
        'Synced 1 skill from version 1.2.3.',
      ].join('\n'),
    );
    expect(result.err).toContain(
      'Warning: replaced local edits in .agents/skills/oak-alpha/SKILL.md.',
    );
    expect(result.err).toContain('"oak-skills promote"');
  });

  describe('--dry-run', () => {
    it('prints the plan and changes nothing', async () => {
      const repo = consumer();
      const result = await sync(repo.root, '--dry-run');
      expect(result.out).toBe(
        [
          'Would add oak-alpha',
          'Would add oak-beta',
          'Would link .claude/skills/oak-alpha',
          'Would link .claude/skills/oak-beta',
          'Dry run: nothing was changed. A sync would leave 2 skills from version 1.2.3.',
        ].join('\n'),
      );
      expect(existsSync(join(repo.root, '.agents'))).toBe(false);
      expect(repo.git('status', '--porcelain')).toBe('M package.json');
    });

    it('warns which edits a real sync would replace', async () => {
      const { root } = consumer();
      await sync(root);
      writeFileSync(join(root, '.agents/skills/oak-beta/SKILL.md'), 'edited');
      expect((await sync(root, '--dry-run')).err).toContain(
        'Warning: would replace local edits in',
      );
    });
  });

  describe('--json', () => {
    it('prints the result as JSON', async () => {
      const { root } = consumer();
      const result = await sync(root, '--json');
      expect(result.code).toBe(0);
      expect(JSON.parse(result.out)).toEqual({
        dryRun: false,
        version: '1.2.3',
        changed: true,
        added: ['oak-alpha', 'oak-beta'],
        updated: [],
        removed: [],
        unchanged: [],
        links: { created: ['oak-alpha', 'oak-beta'], removed: [] },
        replacedEdits: [],
        unmanaged: [],
        conflicts: [],
        warnings: [],
      });
    });

    it('lists updated skills and the local edits they replaced', async () => {
      const { root } = consumer();
      await sync(root);
      writeFileSync(join(root, '.agents/skills/oak-beta/SKILL.md'), 'edited');
      expect(JSON.parse((await sync(root, '--json')).out)).toMatchObject({
        changed: true,
        updated: ['oak-beta'],
        unchanged: ['oak-alpha'],
        replacedEdits: ['.agents/skills/oak-beta/SKILL.md'],
      });
    });

    it('combines with --dry-run, and lists unmanaged entries and conflicts', async () => {
      const { root } = consumer();
      writeTree(root, {
        '.agents/skills/oak-alpha/SKILL.md': 'not ours',
        '.agents/skills/notes/SKILL.md': 'not ours',
        '.claude/skills/mine/SKILL.md': 'not ours',
      });
      const result = await sync(root, '--json', '--dry-run');
      expect(result.code).toBe(ExitCode.Unmanaged);
      expect(JSON.parse(result.out)).toMatchObject({
        dryRun: true,
        unmanaged: ['.agents/skills/notes', '.claude/skills/mine'],
        conflicts: ['.agents/skills/oak-alpha'],
      });
    });
  });

  it('leaves unmanaged entries alone, with a note', async () => {
    const { root } = consumer();
    writeTree(root, { '.agents/skills/notes/SKILL.md': 'x', '.claude/skills/mine/SKILL.md': 'y' });
    const result = await sync(root);
    expect(result.code).toBe(0);
    expect(result.err).toContain(
      "Note: .agents/skills/notes wasn't written by oak-skills, so it was left alone.",
    );
    expect(result.err).toContain(
      "Note: .claude/skills/mine wasn't written by oak-skills, so it was left alone.",
    );
  });

  it('exits 4 when a folder it did not write blocks a skill', async () => {
    const { root } = consumer();
    writeTree(root, { '.agents/skills/oak-alpha/SKILL.md': 'not ours' });
    const result = await sync(root);
    expect(result.code).toBe(ExitCode.Unmanaged);
    expect(result.err).toContain(
      "Error: .agents/skills/oak-alpha holds files oak-skills didn't write",
    );
    expect(result.err).toContain('oak-skills promote --new');
  });

  it("exits 4 when something blocks a skill's Claude Code link", async () => {
    const { root } = consumer();
    writeTree(root, { '.claude/skills/oak-alpha/SKILL.md': 'not ours' });
    const result = await sync(root);
    expect(result.code).toBe(ExitCode.Unmanaged);
    expect(result.err).toContain(
      "Error: .claude/skills/oak-alpha is something oak-skills didn't write",
    );
  });

  it('warns about an exclude that has no effect', async () => {
    const { root } = consumer({ profiles: ['base'], exclude: ['oak-gamma'] });
    expect((await sync(root)).err).toBe(
      'Warning: exclude lists "oak-gamma", but none of your profiles includes it, so it has no effect.',
    );
  });

  it.each([
    ['an unknown profile', { profiles: ['bse'] }, 'unknown profile "bse"'],
    ['an unknown bundle', { profiles: ['base'], bundle: 'xyz' }, 'unknown bundle "xyz"'],
    ['no oakSkills settings', NO_SETTINGS, 'package.json has no oakSkills settings.'],
  ])('exits 5 on %s, and writes nothing', async (_label, oakSkills, message) => {
    const { root } = consumer(oakSkills);
    const result = await sync(root);
    expect(result.code).toBe(ExitCode.Configuration);
    expect(result.err).toContain(message);
    expect(existsSync(join(root, '.agents'))).toBe(false);
  });

  it('exits 5 outside a git repository', async () => {
    const dir = makeTempDir('no-git');
    cleanups.push(() => {
      removeTree(dir);
    });
    expect((await sync(dir)).code).toBe(ExitCode.Configuration);
  });
});
