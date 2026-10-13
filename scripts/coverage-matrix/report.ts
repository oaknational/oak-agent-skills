import { PACKAGE_NAME } from '../../src/lib/settings-files.ts';
import type { Row } from './collect.ts';

const cell = (text: string) => text.replace(/\|/g, '\\|');
const or = (value: string | undefined, fallback = 'none') => value ?? fallback;

export function versionSpread(rows: readonly Row[]): Record<string, number> {
  const spread: Record<string, number> = {};
  for (const row of rows) {
    const version = or(row.version, 'unknown');
    spread[version] = (spread[version] ?? 0) + 1;
  }
  return spread;
}

// Markdown for the run's summary page. The table has a header row, so screen readers can
// announce each column.
export function renderMarkdown(rows: readonly Row[], generatedAt: Date): string {
  const lines = [
    '# Agent skills coverage',
    '',
    `${String(rows.length)} ${rows.length === 1 ? 'repository uses' : 'repositories use'} \`${PACKAGE_NAME}\`, as of ${generatedAt.toISOString().slice(0, 10)}.`,
    '',
  ];
  if (rows.length === 0) return `${lines.join('\n')}\n`;

  const spread = Object.entries(versionSpread(rows))
    .map(([version, count]) => `${version} (${String(count)})`)
    .join(', ');
  const flagged = rows.filter((row) => row.flags.length > 0).length;
  lines.push(
    `Versions in use: ${spread}.`,
    '',
    `Repositories with flags to look at: ${String(flagged)}.`,
    '',
  );
  lines.push(
    '| Repository | Version | Skills synced from | Profiles | Bundle | Skills | Open update | Last update merged after | Flags |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  );
  for (const row of rows) {
    lines.push(
      `| ${[
        row.repository,
        or(row.version, 'unknown'),
        or(row.syncedVersion, 'not synced'),
        row.profiles.length === 0 ? 'none' : row.profiles.join(', '),
        or(row.bundle),
        row.skills === undefined ? 'none' : String(row.skills),
        row.openUpdate === undefined
          ? 'none'
          : `#${String(row.openUpdate.number)}, open ${String(row.openUpdate.days)} days`,
        row.lastMergeDays === undefined ? 'none' : `${String(row.lastMergeDays)} days`,
        row.flags.length === 0 ? 'none' : row.flags.join('; '),
      ]
        .map(cell)
        .join(' | ')} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}

export function renderJson(rows: readonly Row[], generatedAt: Date, org: string): string {
  return `${JSON.stringify({ generatedAt: generatedAt.toISOString(), org, package: PACKAGE_NAME, versions: versionSpread(rows), repositories: rows }, null, 2)}\n`;
}
