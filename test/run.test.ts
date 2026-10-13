import { describe, expect, it } from 'vitest';
import { run } from '../src/run.ts';
import { readPackageInfo } from '../src/lib/package-info.ts';

function capture(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = run(args, { out: (t) => out.push(t), err: (t) => err.push(t) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

describe('run', () => {
  it.each(['--version', '-v'])('prints the package version for %s', (flag) => {
    const result = capture([flag]);
    expect(result).toEqual({ code: 0, out: readPackageInfo().version, err: '' });
  });

  it.each([[], ['--help'], ['-h']])('prints usage for %j', (...args) => {
    const result = capture(args);
    expect(result.code).toBe(0);
    expect(result.out).toMatch(/^Usage: oak-skills/);
    expect(result.err).toBe('');
  });

  it('rejects an unknown command with exit code 1', () => {
    const result = capture(['not-a-command']);
    expect(result.code).toBe(1);
    expect(result.out).toBe('');
    expect(result.err).toContain('Unknown command: not-a-command');
  });
});
