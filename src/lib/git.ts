import { execFileSync } from 'node:child_process';
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
