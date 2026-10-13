import { describe, expect, it } from 'vitest';
import { OakSkillsError, UsageError } from '../../src/lib/errors.ts';
import { ExitCode } from '../../src/lib/exit-codes.ts';

describe('OakSkillsError', () => {
  it('defaults to the failure exit code and no hint', () => {
    const error = new OakSkillsError('Something went wrong');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('OakSkillsError');
    expect(error.exitCode).toBe(ExitCode.Failure);
    expect(error.hint).toBeUndefined();
  });

  it('keeps a given exit code and hint', () => {
    const error = new OakSkillsError('Bad config', {
      exitCode: ExitCode.Configuration,
      hint: 'Fix it',
    });
    expect(error.exitCode).toBe(ExitCode.Configuration);
    expect(error.hint).toBe('Fix it');
  });
});

describe('UsageError', () => {
  it('uses the usage exit code, with or without a hint', () => {
    expect(new UsageError('Bad flag').exitCode).toBe(ExitCode.Usage);
    expect(new UsageError('Bad flag').hint).toBeUndefined();
    expect(new UsageError('Bad flag', 'Try --help').hint).toBe('Try --help');
    expect(new UsageError('Bad flag')).toBeInstanceOf(OakSkillsError);
  });
});
