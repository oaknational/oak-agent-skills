import { ExitCode } from './exit-codes.ts';

// An error the user can act on. run() prints its message, and any hint, without a stack trace.
export class OakSkillsError extends Error {
  readonly exitCode: number;
  readonly hint: string | undefined;

  constructor(message: string, options: { exitCode?: number; hint?: string } = {}) {
    super(message);
    this.name = 'OakSkillsError';
    this.exitCode = options.exitCode ?? ExitCode.Failure;
    this.hint = options.hint;
  }
}

export class UsageError extends OakSkillsError {
  constructor(message: string, hint?: string) {
    super(message, { exitCode: ExitCode.Usage, ...(hint === undefined ? {} : { hint }) });
    this.name = 'UsageError';
  }
}
