import { parseArgs } from 'node:util';
import type { Command, Output } from './commands/command.ts';
import { commands as defaultCommands } from './commands/index.ts';
import { OakSkillsError, UsageError } from './lib/errors.ts';
import { ExitCode } from './lib/exit-codes.ts';
import { readPackageInfo } from './lib/package-info.ts';

export type { Output } from './commands/command.ts';

export function usage(commands: readonly Command[]): string {
  const width = Math.max(0, ...commands.map((command) => command.name.length));
  return [
    'Usage: oak-skills <command> [options]',
    '',
    'Commands:',
    ...commands.map((command) => `  ${command.name.padEnd(width)}  ${command.summary}`),
    '',
    'Options:',
    '  --help, -h     Show help for oak-skills or a command',
    '  --version, -v  Show the version',
    '',
    'Run "oak-skills <command> --help" for a command\'s options.',
  ].join('\n');
}

function commandUsage(command: Command): string {
  return `Usage: ${command.usage}\n\n${command.summary}`;
}

export interface RunOptions {
  commands?: readonly Command[];
  cwd?: string;
}

export async function run(
  args: readonly string[],
  output: Output,
  options: RunOptions = {},
): Promise<number> {
  const commands = options.commands ?? defaultCommands;
  const [first, ...rest] = args;

  if (first === '--version' || first === '-v') {
    output.out(readPackageInfo().version);
    return ExitCode.Ok;
  }
  if (first === undefined || first === '--help' || first === '-h') {
    output.out(usage(commands));
    return ExitCode.Ok;
  }

  const command = commands.find((candidate) => candidate.name === first);
  try {
    if (command === undefined) {
      throw new UsageError(
        `Unknown command: ${first}`,
        'Run "oak-skills --help" to list the commands.',
      );
    }
    if (rest.includes('--help') || rest.includes('-h')) {
      output.out(commandUsage(command));
      return ExitCode.Ok;
    }
    let parsed;
    try {
      parsed = parseArgs({
        args: rest,
        options: command.options,
        allowPositionals: command.allowPositionals ?? false,
        strict: true,
      });
    } catch (error) {
      // parseArgs explains what was wrong, such as an unknown option or a missing value.
      throw new UsageError(
        (error as Error).message,
        `Run "oak-skills ${command.name} --help" for its options.`,
      );
    }
    return await command.run({
      values: parsed.values,
      positionals: parsed.positionals,
      output,
      cwd: options.cwd ?? process.cwd(),
    });
  } catch (error) {
    if (error instanceof OakSkillsError) {
      output.err(`oak-skills: ${error.message}`);
      if (error.hint !== undefined) output.err(error.hint);
      return error.exitCode;
    }
    output.err(
      `oak-skills: unexpected error: ${error instanceof Error ? String(error.stack) : String(error)}`,
    );
    output.err('This is a bug in oak-skills. Please report it in a skill-feedback issue.');
    return ExitCode.Internal;
  }
}
