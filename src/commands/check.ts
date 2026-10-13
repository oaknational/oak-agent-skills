import { ExitCode } from '../lib/exit-codes.ts';
import { computeStatus, statusExitCode } from '../lib/status.ts';
import type { Command } from './command.ts';
import { STATUS_NAMES } from './status.ts';

export const TROUBLESHOOTING_URL =
  'https://github.com/oaknational/oak-agent-skills/blob/main/docs/troubleshooting.md';

function editedSkills(paths: readonly string[]): string[] {
  const names = paths.map(
    (path) => /^\.(?:agents|claude)\/skills\/([^/ ]+)/.exec(path)?.[1] ?? path,
  );
  return [...new Set(names)];
}

export const check: Command = {
  name: 'check',
  summary: 'Fail if the synced skills have changed or are out of date, naming the fix. For CI.',
  usage: 'oak-skills check',
  options: {},
  run: ({ cwd, output, packageDir }) => {
    const report = computeStatus(cwd, packageDir);
    const exitCode = statusExitCode(report);
    if (exitCode === ExitCode.Ok) {
      output.out(
        `oak-skills check passed: ${String(report.clean.length)} skill${report.clean.length === 1 ? '' : 's'} match version ${report.toolVersion}.`,
      );
      return exitCode;
    }

    const problem = (heading: string, items: readonly string[], fix: string): void => {
      if (items.length === 0) return;
      output.err(`${heading}:`);
      for (const item of items) output.err(`  ${item}`);
      output.err(`  Fix: ${fix}`);
      output.err('');
    };
    problem(
      'Configuration problems',
      report.configProblems,
      'correct the oakSkills settings in the root package.json.',
    );
    problem(
      'Not written by oak-skills',
      report.unmanaged,
      'move a skill into the central repository with "oak-skills promote --new <name>", or remove it.',
    );
    const skills = editedSkills(report.edited);
    problem(
      'Edited since the last sync',
      report.edited,
      `if the change improves the skill, send it to the central repository with "oak-skills promote ${skills.length === 1 ? (skills[0] ?? '<skill>') : '<skill>'}". Otherwise revert it, or run "oak-skills sync" to restore the synced copy.`,
    );
    problem('Out of date', report.outOfDate, 'run "oak-skills sync" and commit the result.');

    output.err(
      `oak-skills check failed: ${String(STATUS_NAMES[exitCode])} (exit code ${String(exitCode)}).`,
    );
    output.err(`See ${TROUBLESHOOTING_URL}#exit-code-${String(exitCode)}`);
    return exitCode;
  },
};
