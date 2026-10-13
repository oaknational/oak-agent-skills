import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { run } from '../../src/run.ts';
import { capture } from '../helpers/capture.ts';
import { repoRoot } from '../helpers/paths.ts';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.ts';
import { removeTree, skillText, writeTree } from '../helpers/tree.ts';

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
        "skills/profiles.json: doesn't list code-review in any profile, so no repository could receive it",
        "skills/central/oak-example/SKILL.md: has changed since the last commit, but metadata.updated is still 2025-06-01. Set it to today's date.",
        'README.md: has an out-of-date skills table. Run pnpm readme:skills.',
        '',
        'Found 5 problems in 2 skills.',
      ].join('\n'),
    );
  });

  it('requires a CODEOWNERS line for each repository bundle', async () => {
    const repo = createTempRepo('central-repo');
    repos.push(repo);
    writeTree(repo.root, {
      'skills/repos/owa/owa-routing/SKILL.md': skillText({ name: 'owa-routing' }),
      'skills/repos/not-a-code/x/SKILL.md': skillText({ name: 'x' }),
    });
    const missing = await validateIn(repo.root);
    expect(missing.code).toBe(1);
    expect(missing.err).toContain('.github/CODEOWNERS: has no line for /skills/repos/owa/.');

    writeTree(repo.root, {
      '.github/CODEOWNERS':
        '* @oaknational/skills-maintainers\n/skills/repos/owa/ @oaknational/owa-team @oaknational/skills-maintainers\n',
    });
    removeTree(join(repo.root, 'skills/repos/not-a-code'));
    const regenerated = spawnSync(
      process.execPath,
      [join(repoRoot, 'scripts/readme-skills-table.ts')],
      {
        cwd: repo.root,
      },
    );
    expect(regenerated.status).toBe(0);
    expect(await validateIn(repo.root)).toEqual({
      code: 0,
      out: 'Checked 2 skills: no problems.',
      err: '',
    });
  });

  it('says "1 problem" for a single problem', async () => {
    const repo = createTempRepo('central-repo');
    repos.push(repo);
    writeFileSync(join(repo.root, 'skills/stray.md'), '');
    expect((await validateIn(repo.root)).err).toContain('Found 1 problem in 1 skill.');
  });

  it('reports only the given skills, plus problems that belong to the whole repository', async () => {
    const repo = createTempRepo('central-repo');
    repos.push(repo);
    writeTree(repo.root, {
      'skills/central/oak-bad/SKILL.md': skillText({ name: 'oak-bad', body: 'Run !`ls`.' }),
      'skills/central/oak-other/SKILL.md': skillText({ name: 'oak-other', body: 'Run !`pwd`.' }),
    });
    const captured = capture();
    const code = await run(
      [
        'validate',
        join(repo.root, 'skills/central/oak-bad/SKILL.md'),
        'skills/central/oak-example',
        'README.md',
      ],
      captured.output,
      { cwd: repo.root },
    );
    expect(code).toBe(1);
    expect(captured.err()).toContain(
      'skills/central/oak-bad/SKILL.md:10: uses the !`command` syntax',
    );
    expect(captured.err()).not.toContain('oak-other/SKILL.md');
    expect(captured.err()).toContain("skills/profiles.json: doesn't list oak-other in any profile");
    expect(captured.err()).toContain('README.md: has an out-of-date skills table.');
  });

  it('passes when the given paths hold no problems', async () => {
    const repo = createTempRepo('central-repo');
    repos.push(repo);
    const captured = capture();
    expect(
      await run(['validate', 'skills/central/oak-example/SKILL.md'], captured.output, {
        cwd: repo.root,
      }),
    ).toBe(0);
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
