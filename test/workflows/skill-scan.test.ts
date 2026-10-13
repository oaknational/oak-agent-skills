import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadDevDependencies } from '../../src/lib/validate/dev-dependencies.ts';
import { repoRoot } from '../helpers/paths.ts';
import { createTempRepo, isolatedGitEnv, type TempRepo } from '../helpers/temp-repo.ts';
import { makeTempDir, removeTree, skillText, writeTree } from '../helpers/tree.ts';

let chooseSkills: string;
beforeAll(async () => {
  const { yaml } = await loadDevDependencies();
  const workflow = yaml.parse(
    readFileSync(join(repoRoot, '.github/workflows/skill-scan.yml'), 'utf8'),
  ) as {
    jobs: { scan: { steps: { name?: string; run?: string }[] } };
  };
  chooseSkills =
    workflow.jobs.scan.steps.find((step) => step.name === 'Choose the skills to scan')?.run ?? '';
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function central(): TempRepo {
  const repo = createTempRepo('central-repo');
  cleanups.push(repo.cleanup);
  writeTree(repo.root, {
    'skills/central/oak-other/SKILL.md': skillText({ name: 'oak-other' }),
    'skills/repos/owa/owa-routing/SKILL.md': skillText({ name: 'owa-routing' }),
  });
  repo.git('add', '--all');
  repo.git('commit', '--quiet', '--message', 'chore: more skills');
  // Stands in for the base branch that actions/checkout fetches.
  repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
  return repo;
}

function choose(root: string, event: string): string[] {
  const temp = makeTempDir('runner');
  cleanups.push(() => {
    removeTree(temp);
  });
  const result = spawnSync('bash', ['-eo', 'pipefail', '-c', chooseSkills], {
    cwd: root,
    encoding: 'utf8',
    env: { ...isolatedGitEnv, EVENT: event, BASE_REF: 'main', RUNNER_TEMP: temp },
  });
  expect(result.stderr).toBe('');
  expect(result.status).toBe(0);
  const list = readFileSync(join(temp, 'skills.txt'), 'utf8').trim();
  return list === '' ? [] : list.split('\n');
}

describe('the skill scan', () => {
  it('scans every skill on the weekly run', () => {
    expect(choose(central().root, 'schedule')).toEqual([
      'skills/central/oak-example',
      'skills/central/oak-other',
      'skills/repos/owa/owa-routing',
    ]);
  });

  it('scans nothing on the weekly run when there are no skills yet', () => {
    const repo = createTempRepo('single-package');
    cleanups.push(repo.cleanup);
    expect(choose(repo.root, 'schedule')).toEqual([]);
  });

  it('scans only the skills a pull request changes, leaving out deleted ones', () => {
    const repo = central();
    repo.git('switch', '--quiet', '--create', 'feature');
    writeTree(repo.root, {
      'skills/central/oak-example/references/guide.md': '# Changed\n',
      'skills/repos/owa/owa-new/SKILL.md': skillText({ name: 'owa-new' }),
    });
    repo.git('rm', '--quiet', '-r', 'skills/central/oak-other');
    repo.git('add', '--all');
    repo.git('commit', '--quiet', '--message', 'feat: changes');
    expect(choose(repo.root, 'pull_request')).toEqual([
      'skills/central/oak-example',
      'skills/repos/owa/owa-new',
    ]);
  });

  it('scans nothing when a pull request changes no skills', () => {
    const repo = central();
    repo.git('switch', '--quiet', '--create', 'feature');
    writeTree(repo.root, { 'README.md': '# Changed\n' });
    repo.git('add', '--all');
    repo.git('commit', '--quiet', '--message', 'docs: readme');
    expect(choose(repo.root, 'pull_request')).toEqual([]);
  });
});
