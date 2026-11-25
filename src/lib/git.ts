import { execFileSync, spawnSync } from 'node:child_process';
import { OakSkillsError } from './errors.ts';

export function runGit(args: readonly string[], cwd: string): string {
  try {
    return execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (error) {
    const { stderr, code } = error as { stderr?: string; code?: string };
    if (code === 'ENOENT') {
      throw new OakSkillsError('git is not installed, or is not on the PATH.');
    }
    throw new OakSkillsError(`git ${args.join(' ')} failed: ${(stderr ?? '').trim()}`);
  }
}

export function ignoredByGit(root: string, paths: readonly string[]): Set<string> {
  if (paths.length === 0) return new Set();
  const result = spawnSync('git', ['check-ignore', '-z', '--stdin'], {
    cwd: root,
    input: paths.join('\0'),
    encoding: 'utf8',
  });
  if (result.status !== 0 && result.status !== 1) return new Set();
  return new Set(result.stdout.split('\0').filter((path) => path !== ''));
}
