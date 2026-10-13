import type { Problem } from './problem.ts';
import type { CheckedSkill } from './skill-checks.ts';

// Agents list every skill's description at the start of a session, within a budget. Claude Code
// allows 1% of the context window and Codex 2%, or 8,000 characters when it doesn't know the
// window; both come to about 8,000 characters for common models. A starting cap, to tune in the pilot.
export const DESCRIPTION_BUDGET = 8000;

// Cursor and Copilot read both .agents/skills/ and .claude/skills/, so they list each skill twice.
export const LISTING_COPIES = 2;

// A repository receives at most every shared skill plus its own bundle, so check each bundle,
// and the shared skills alone for repositories without one.
export function checkDescriptionBudget(skills: readonly CheckedSkill[]): Problem[] {
  let shared = 0;
  const bundles = new Map<string, number>();
  for (const { location, frontmatter } of skills) {
    if (frontmatter === undefined) continue;
    const { length } = frontmatter.description;
    if (location.bundle === undefined) shared += length;
    else bundles.set(location.bundle, (bundles.get(location.bundle) ?? 0) + length);
  }

  const problems: Problem[] = [];
  const check = (label: string, file: string, characters: number): void => {
    const listed = characters * LISTING_COPIES;
    if (listed > DESCRIPTION_BUDGET) {
      problems.push({
        file,
        message: `${label} have descriptions totalling ${String(characters)} characters, listed ${String(LISTING_COPIES)} times: ${String(listed)}, over the budget of ${String(DESCRIPTION_BUDGET)}. Shorten descriptions, or merge skills that do the same kind of task.`,
      });
    }
  };
  check('The shared skills', 'skills/central', shared);
  for (const [bundle, total] of [...bundles].sort(([a], [b]) => (a < b ? -1 : 1))) {
    check(`The shared skills and the ${bundle} bundle`, `skills/repos/${bundle}`, shared + total);
  }
  return problems;
}
