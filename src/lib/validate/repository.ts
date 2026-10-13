import { findSkills } from './central-repo.ts';
import type { DevDependencies } from './dev-dependencies.ts';
import type { Problem } from './problem.ts';
import type { SchemaName, SchemaValidator } from './schemas.ts';
import { checkSkill, type CheckedSkill } from './skill-checks.ts';

export interface ValidationResult {
  skills: CheckedSkill[];
  problems: Problem[];
}

export function validateRepository(
  root: string,
  deps: Pick<DevDependencies, 'yaml'>,
  validators: Record<SchemaName, SchemaValidator>,
): ValidationResult {
  const found = findSkills(root);
  const skills = found.skills.map((location) =>
    checkSkill(root, location, deps, validators.frontmatter),
  );
  return { skills, problems: [...found.problems, ...skills.flatMap((skill) => skill.problems)] };
}
