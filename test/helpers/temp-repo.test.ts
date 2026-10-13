import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createTempRepo, type FixtureName, type TempRepo } from './temp-repo.ts';

const repos: TempRepo[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});

describe('createTempRepo', () => {
  it.each<[FixtureName, string[]]>([
    ['single-package', ['package.json']],
    ['settings-only-workspace', ['package.json', 'pnpm-workspace.yaml']],
    ['workspace', ['package.json', 'pnpm-workspace.yaml', 'apps/web/package.json', 'packages/ui/package.json']],
  ])('builds a committed git repository from the %s fixture', (fixture, files) => {
    const repo = createTempRepo(fixture);
    repos.push(repo);

    expect(repo.git('rev-parse', '--show-toplevel')).toBe(repo.root);
    expect(repo.git('status', '--porcelain')).toBe('');
    expect(repo.git('ls-files').split('\n').sort()).toEqual([...files].sort());
  });

  it('removes the repository on cleanup', () => {
    const repo = createTempRepo('single-package');
    repo.cleanup();
    expect(existsSync(join(repo.root, 'package.json'))).toBe(false);
  });
});
