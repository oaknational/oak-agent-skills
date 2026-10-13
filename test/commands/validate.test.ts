import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../../src/run.ts';
import { capture } from '../helpers/capture.ts';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.ts';
import { skillText, writeTree } from '../helpers/tree.ts';

const repos: TempRepo[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});

async function validateIn(cwd: string) {
  const captured = capture();
  const code = await run(['validate'], captured.output, { cwd });
  return { code, out: captured.out(), err: captured.err() };
}

describe('oak-skills validate', () => {
  it('passes a central repository whose skills follow the rules', async () => {
    const repo = createTempRepo('central-repo');
    repos.push(repo);
    expect(await validateIn(repo.root)).toEqual({
      code: 0,
      out: 'Checked 1 skill: no problems.',
      err: '',
    });
  });

  it('lists every problem and fails', async () => {
    const repo = createTempRepo('central-repo');
    repos.push(repo);
    writeTree(repo.root, {
      'skills/central/code-review/SKILL.md': skillText({ name: 'code-review' }),
    });
    writeFileSync(
      join(repo.root, 'skills/central/oak-example/SKILL.md'),
      skillText({ body: 'Run !`ls` first.' }),
    );
    const result = await validateIn(repo.root);
    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toBe(
      [
        'skills/central/code-review: is a shared skill, so its name must start with "oak-"',
        'skills/central/oak-example/SKILL.md:10: uses the !`command` syntax, which Claude Code runs as a shell command before the skill reaches the model',
        '',
        'Found 2 problems in 2 skills.',
      ].join('\n'),
    );
  });

  it('says "1 problem" for a single problem', async () => {
    const repo = createTempRepo('central-repo');
    repos.push(repo);
    writeFileSync(join(repo.root, 'skills/stray.md'), '');
    expect((await validateIn(repo.root)).err).toContain('Found 1 problem in 1 skill.');
  });

  it('refuses to run outside the central repository', async () => {
    const repo = createTempRepo('single-package');
    repos.push(repo);
    expect(await validateIn(repo.root)).toEqual({
      code: 1,
      out: '',
      err: 'oak-skills: oak-skills validate only runs in the central oak-agent-skills repository.\nConsuming repositories run "oak-skills check" instead.',
    });
  });
});
