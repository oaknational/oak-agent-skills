import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { BUNDLE_CODE, findSkills } from './central-repo.ts';
import { checkCodeowners } from './codeowners.ts';
import type { DevDependencies } from './dev-dependencies.ts';
import type { Problem } from './problem.ts';
import { checkProfiles, type Profiles } from './profiles.ts';
import type { SchemaName, SchemaValidator } from './schemas.ts';
import { checkSkill, type CheckedSkill } from './skill-checks.ts';
import { checkUpdatedDates } from './updated-dates.ts';

export interface ValidationResult {
  skills: CheckedSkill[];
  profiles: Profiles | undefined;
  problems: Problem[];
}

function bundleCodes(root: string): string[] {
  const repos = join(root, 'skills/repos');
  if (!existsSync(repos)) return [];
  return readdirSync(repos, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && BUNDLE_CODE.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function validateRepository(
  root: string,
  deps: Pick<DevDependencies, 'yaml'>,
  validators: Record<SchemaName, SchemaValidator>,
  env: NodeJS.ProcessEnv = process.env,
): ValidationResult {
  const found = findSkills(root);
  const skills = found.skills.map((location) =>
    checkSkill(root, location, deps, validators.frontmatter),
  );
  const shared = skills.filter((s) => s.location.bundle === undefined).map((s) => s.location.name);
  const profiles = checkProfiles(root, shared, validators.profiles);
  return {
    skills,
    profiles: profiles.profiles,
    problems: [
      ...found.problems,
      ...skills.flatMap((skill) => skill.problems),
      ...profiles.problems,
      ...checkUpdatedDates(root, skills, deps, env),
      ...checkCodeowners(root, bundleCodes(root)),
    ],
  };
}
