import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fixturesDir } from './paths.ts';

export type FixtureName =
  'single-package' | 'settings-only-workspace' | 'workspace' | 'central-repo';

export interface TempRepo {
  root: string;
  git: (...args: string[]) => string;
  cleanup: () => void;
}

// Keeps the developer's own git settings, such as hooks, signing and identity, out of tests.
export const isolatedGitEnv: NodeJS.ProcessEnv = {
  ...process.env,
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'oak-skills tests',
  GIT_AUTHOR_EMAIL: 'oak-skills-tests@users.noreply.github.com',
  GIT_COMMITTER_NAME: 'oak-skills tests',
  GIT_COMMITTER_EMAIL: 'oak-skills-tests@users.noreply.github.com',
};

export function createTempRepo(fixture: FixtureName): TempRepo {
  // realpath, because macOS reaches the temporary folder through a symlink and git reports the real path.
  const root = realpathSync(mkdtempSync(join(tmpdir(), `oak-skills-${fixture}-`)));
  cpSync(join(fixturesDir, fixture), root, { recursive: true });

  const git = (...args: string[]): string =>
    execFileSync('git', args, { cwd: root, env: isolatedGitEnv, encoding: 'utf8' }).trim();

  git('init', '--quiet', '--initial-branch=main');
  git('add', '--all');
  git('commit', '--quiet', '--message', 'chore: start from the fixture');

  return {
    root,
    git,
    cleanup: () => {
      rmSync(root, { recursive: true, force: true });
    },
  };
}
