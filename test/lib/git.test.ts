import { afterEach, describe, expect, it, vi } from 'vitest';
import { runGit } from '../../src/lib/git.ts';
import { createTempRepo } from '../helpers/temp-repo.ts';
import { makeTempDir, removeTree } from '../helpers/tree.ts';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runGit', () => {
  it('returns git output without the trailing newline', () => {
    const repo = createTempRepo('single-package');
    try {
      expect(runGit(['rev-parse', '--show-toplevel'], repo.root)).toBe(repo.root);
    } finally {
      repo.cleanup();
    }
  });

  it("reports git's error output when a command fails", () => {
    const dir = makeTempDir('git');
    try {
      expect(() => runGit(['rev-parse', '--show-toplevel'], dir)).toThrow(
        /^git rev-parse --show-toplevel failed: fatal: not a git repository/,
      );
    } finally {
      removeTree(dir);
    }
  });

  it('explains when git is not installed', () => {
    vi.stubEnv('PATH', '');
    expect(() => runGit(['--version'], process.cwd())).toThrow(
      'git is not installed, or is not on the PATH.',
    );
  });
});
