import type { Problem } from './problem.ts';
import type { CheckedSkill } from './skill-checks.ts';

const PREFIX = 'Deprecated:';

export function checkDeprecations(skills: readonly CheckedSkill[]): Problem[] {
  const names = new Set(skills.map((skill) => skill.location.name));
  const problems: Problem[] = [];
  for (const { location, frontmatter } of skills) {
    if (frontmatter === undefined) continue;
    const file = `${location.path}/SKILL.md`;
    const replacement = frontmatter.metadata.deprecated;
    const saysDeprecated = frontmatter.description.startsWith(PREFIX);
    if (replacement === undefined) {
      if (saysDeprecated) {
        problems.push({
          file,
          message: `has a description starting "${PREFIX}" but no metadata.deprecated naming its replacement`,
        });
      }
      continue;
    }
    if (!saysDeprecated) {
      problems.push({
        file,
        message: `is deprecated, so its description must start with "${PREFIX}"`,
      });
    }
    if (replacement === location.name) {
      problems.push({ file, message: 'names itself as its replacement in metadata.deprecated' });
    } else if (!names.has(replacement)) {
      problems.push({
        file,
        message: `names ${replacement} as its replacement in metadata.deprecated, but there's no skill with that name`,
      });
    }
  }
  return problems;
}
