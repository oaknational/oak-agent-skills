import type { ParseArgsOptionsConfig } from 'node:util';
import type { GitHub } from '../lib/github.ts';
import type { Prompt } from '../lib/prompt.ts';

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
  // Stand-ins for GitHub and the terminal. Only tests set them.
  github?: GitHub;
  prompt?: Prompt;
  now?: Date;
}

export interface Command {
  name: string;
  summary: string;
  usage: string;
  options: ParseArgsOptionsConfig;
  allowPositionals?: boolean;
  run: (context: CommandContext) => Promise<number> | number;
}
