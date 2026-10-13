import type { ParseArgsOptionsConfig } from 'node:util';

export interface Output {
  out: (text: string) => void;
  err: (text: string) => void;
}

export type OptionValues = Record<string, string | boolean | (string | boolean)[] | undefined>;

export interface CommandContext {
  values: OptionValues;
  positionals: string[];
  output: Output;
  cwd: string;
  // The installed package to read skills from. Only tests set it.
  packageDir?: string;
}

export interface Command {
  name: string;
  summary: string;
  usage: string;
  options: ParseArgsOptionsConfig;
  allowPositionals?: boolean;
  run: (context: CommandContext) => Promise<number> | number;
}
