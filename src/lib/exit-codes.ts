// status and check share codes 0 to 6, as ADR 0001 sets out. When several apply, the highest wins.
// Every other command exits 0 on success and 1 on failure.
export const ExitCode = {
  Ok: 0,
  Failure: 1,
  Edited: 1,
  VersionMismatch: 2,
  EditedAndVersionMismatch: 3,
  Unmanaged: 4,
  Configuration: 5,
  AgentsMdTooLarge: 6,
  // Conventional codes for a mistake in the command line itself, and for a bug in the tool.
  Usage: 64,
  Internal: 70,
} as const;

export type ExitCode = (typeof ExitCode)[keyof typeof ExitCode];
