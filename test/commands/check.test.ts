import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { TROUBLESHOOTING_ANCHORS } from '../../src/commands/check.ts';
import { applySync, planSync } from '../../src/lib/sync.ts';
import { run } from '../../src/run.ts';
import { capture } from '../helpers/capture.ts';
import { copyPackage, setOakSkills, setPackageVersion } from '../helpers/consumer.ts';
import { packageFixture, repoRoot } from '../helpers/paths.ts';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.ts';
import { removeTree, writeTree } from '../helpers/tree.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function synced(oakSkills: unknown = { profiles: ['base'] }): TempRepo {
  const repo = createTempRepo('single-package');
  cleanups.push(repo.cleanup);
  setOakSkills(repo.root, oakSkills);
  applySync(planSync(repo.root, packageFixture));
  return repo;
}

async function check(cwd: string, packageDir = packageFixture) {
  const captured = capture();
  const code = await run(['check'], captured.output, { cwd, packageDir });
  return { code, out: captured.out(), err: captured.err() };
}

const docs = 'https://github.com/oaknational/oak-agent-skills/blob/main/docs/troubleshooting.md';

describe('oak-skills check', () => {
  it('passes a clean repository', async () => {
    const { root } = synced();
    expect(await check(root)).toEqual({
      code: 0,
      out: 'oak-skills check passed: 2 skills match version 1.2.3.',
      err: '',
    });
  });

  it('says "1 skill" for a single skill', async () => {
    const { root } = synced({ profiles: [], include: ['oak-beta'] });
    expect((await check(root)).out).toBe('oak-skills check passed: 1 skill match version 1.2.3.');
  });

  it('fails with exit code 1 on a local edit, naming the skill to promote', async () => {
    const { root } = synced();
    writeFileSync(join(root, '.agents/skills/oak-alpha/SKILL.md'), 'edited');
    expect(await check(root)).toEqual({
      code: 1,
      out: '',
      err: [
        'Edited since the last sync:',
        '  .agents/skills/oak-alpha/SKILL.md',
        '  Fix: if the change improves the skill, send it to the central repository with "oak-skills promote oak-alpha". Otherwise revert it, or run "oak-skills sync" to restore the synced copy.',
        '',
        'oak-skills check failed: edited (exit code 1).',
        `See ${docs}#exit-code-1-a-synced-skill-was-edited`,
      ].join('\n'),
    });
  });

  it('uses a placeholder when several skills were edited', async () => {
    const { root } = synced();
    writeFileSync(join(root, '.agents/skills/oak-alpha/SKILL.md'), 'edited');
    removeTree(join(root, '.claude/skills/oak-beta'));
    expect((await check(root)).err).toContain('"oak-skills promote <skill>"');
  });

  it('fails with exit code 2 on a version mismatch, saying to sync', async () => {
    const { root } = synced();
    const newer = copyPackage();
    cleanups.push(() => {
      removeTree(newer);
    });
    setPackageVersion(newer, '2.0.0');
    const result = await check(root, newer);
    expect(result.code).toBe(2);
    expect(result.err).toContain('Fix: run "oak-skills sync" and commit the result.');
    expect(result.err).toContain(`See ${docs}#exit-code-2-the-skills-are-out-of-date`);
  });

  it('fails with exit code 4 on unmanaged folders', async () => {
    const { root } = synced();
    writeTree(root, { '.agents/skills/oak-draft/SKILL.md': 'draft' });
    const result = await check(root);
    expect(result.code).toBe(4);
    expect(result.err).toContain('Not written by oak-skills:\n  .agents/skills/oak-draft');
    expect(result.err).toContain('oak-skills promote --new <name>');
  });

  it('fails with exit code 5 on a configuration problem', async () => {
    const { root } = synced();
    setOakSkills(root, { profiles: ['base'], bundle: 'nope' });
    const result = await check(root);
    expect(result.code).toBe(5);
    expect(result.err).toContain('Fix: correct the oakSkills settings in the root package.json.');
    expect(result.err).toContain(`See ${docs}#exit-code-5-a-configuration-problem`);
  });

  it('passes with a warning when AGENTS.md is long', async () => {
    const { root } = synced();
    writeTree(root, { 'AGENTS.md': '# Repository\n'.repeat(120) });
    const result = await check(root);
    expect(result.code).toBe(0);
    expect(result.err).toContain('Warning: AGENTS.md has 120 lines.');
  });

  it('fails with exit code 6 when AGENTS.md files pass 32 KiB on a path, above every other code', async () => {
    const { root } = synced();
    writeTree(root, { 'AGENTS.md': 'x'.repeat(30_000), 'docs/AGENTS.md': 'y'.repeat(3_000) });
    setOakSkills(root, { profiles: ['nope'] });
    const result = await check(root);
    expect(result.code).toBe(6);
    expect(result.err).toContain(
      'AGENTS.md too large:\n  AGENTS.md + docs/AGENTS.md total 33000 bytes',
    );
    expect(result.err).toContain('Configuration problems:');
    expect(result.err).toContain('oak-skills check failed: AGENTS.md too large (exit code 6).');
    expect(result.err).toContain(`See ${docs}#exit-code-6-agentsmd-is-too-large`);
  });
});

// GitHub's heading anchors: lower case, punctuation removed, spaces turned into hyphens.
function anchor(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/ /g, '-');
}

describe('the troubleshooting links', () => {
  it.each(Object.entries(TROUBLESHOOTING_ANCHORS))(
    'exit code %s links to a heading that exists',
    (_code, slug) => {
      const headings = readFileSync(join(repoRoot, 'docs/troubleshooting.md'), 'utf8')
        .split('\n')
        .filter((line) => line.startsWith('#'))
        .map((line) => anchor(line.replace(/^#+ /, '')));
      expect(headings).toContain(slug);
    },
  );
});
