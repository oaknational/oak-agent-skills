import { computeStatus, statusExitCode, type StatusReport } from '../lib/status.ts';
import type { Command, Output } from './command.ts';

export const STATUS_NAMES: Record<number, string> = {
  0: 'clean',
  1: 'edited',
  2: 'out of date',
  3: 'edited and out of date',
  4: 'unmanaged files',
  5: 'configuration problem',
  6: 'AGENTS.md too large',
};

export function statusJson(report: StatusReport, exitCode: number): object {
  return {
    status: STATUS_NAMES[exitCode],
    exitCode,
    toolVersion: report.toolVersion,
    syncedVersion: report.syncedVersion ?? null,
    clean: report.clean,
    edited: report.edited,
    outOfDate: report.outOfDate,
    unmanaged: report.unmanaged,
    configProblems: report.configProblems,
  };
}

function section(output: Output, title: string, items: readonly string[]): void {
  if (items.length === 0) return;
  output.out(`${title}:`);
  for (const item of items) output.out(`  ${item}`);
}

export const status: Command = {
  name: 'status',
  summary: 'Report whether the synced skills still match the package, without changing anything.',
  usage: 'oak-skills status [--json]',
  options: { json: { type: 'boolean' } },
  run: ({ cwd, values, output, packageDir }) => {
    const report = computeStatus(cwd, packageDir);
    const exitCode = statusExitCode(report);
    if (values.json === true) {
      output.out(JSON.stringify(statusJson(report, exitCode), null, 2));
      return exitCode;
    }
    output.out(
      `oak-skills ${report.toolVersion}. ${
        report.syncedVersion === undefined
          ? 'No skills have been synced yet.'
          : `Skills synced from version ${report.syncedVersion}.`
      }`,
    );
    section(output, 'Configuration problems', report.configProblems);
    section(output, 'Out of date', report.outOfDate);
    section(output, 'Edited', report.edited);
    section(output, 'Unmanaged', report.unmanaged);
    if (report.clean.length > 0) output.out(`Clean: ${report.clean.join(', ')}`);
    output.out(`Status: ${String(STATUS_NAMES[exitCode])} (exit code ${String(exitCode)})`);
    return exitCode;
  },
};
