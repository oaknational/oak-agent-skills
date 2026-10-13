import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from './problem.ts';
import type { Profiles } from './profiles.ts';
import type { CheckedSkill } from './skill-checks.ts';

export const README_PATH = 'README.md';
export const TABLE_START = '<!-- skills-table:start -->';
export const TABLE_END = '<!-- skills-table:end -->';
export const REGENERATE = 'pnpm readme:skills';

function cell(text: string): string {
  return text.replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim();
}

export function renderSkillsTable(
  skills: readonly CheckedSkill[],
  profiles: Profiles | undefined,
): string {
  const rows = skills
    .filter((skill) => skill.frontmatter !== undefined)
    .sort((a, b) => {
      // Shared skills first, then each bundle, each sorted by name.
      const key = (s: CheckedSkill) => `${s.location.bundle ?? ''}\0${s.location.name}`;
      return key(a) < key(b) ? -1 : 1;
    })
    .map(({ location, frontmatter }) => {
      const appliesTo =
        location.bundle === undefined
          ? Object.entries(profiles?.profiles ?? {})
              .filter(([, profile]) => profile.skills.includes(location.name))
              .map(([name]) => `\`${name}\``)
              .join(', ')
          : `The \`${location.bundle}\` bundle`;
      return `| [\`${location.name}\`](${location.path}/SKILL.md) | ${appliesTo} | ${cell(frontmatter?.description ?? '')} |`;
    });
  if (rows.length === 0) return 'No skills have been published yet.';
  return ['| Skill | Profile or bundle | What it does |', '| --- | --- | --- |', ...rows].join(
    '\n',
  );
}

export function checkReadmeTable(
  root: string,
  skills: readonly CheckedSkill[],
  profiles: Profiles | undefined,
): Problem[] {
  const file = join(root, README_PATH);
  if (!existsSync(file)) return [{ file: README_PATH, message: 'is missing' }];
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf(TABLE_START);
  const end = text.indexOf(TABLE_END);
  if (start === -1 || end === -1 || end < start) {
    return [
      {
        file: README_PATH,
        message: `has no skills table. Add the ${TABLE_START} and ${TABLE_END} markers, then run ${REGENERATE}.`,
      },
    ];
  }
  const current = text.slice(start + TABLE_START.length, end).trim();
  if (current !== renderSkillsTable(skills, profiles)) {
    return [{ file: README_PATH, message: `has an out-of-date skills table. Run ${REGENERATE}.` }];
  }
  return [];
}

// Returns the README with the table between the markers replaced, or undefined if the markers are missing.
export function replaceSkillsTable(readme: string, table: string): string | undefined {
  const start = readme.indexOf(TABLE_START);
  const end = readme.indexOf(TABLE_END);
  if (start === -1 || end === -1 || end < start) return undefined;
  return `${readme.slice(0, start + TABLE_START.length)}\n${table}\n${readme.slice(end)}`;
}
