import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from './problem.ts';
import type { SchemaValidator } from './schemas.ts';

export const PROFILES_PATH = 'skills/profiles.json';

export interface Profiles {
  version: 1;
  profiles: Record<string, { description: string; skills: string[] }>;
}

// sharedSkills are the names of the skills in skills/central/.
export function checkProfiles(
  root: string,
  sharedSkills: readonly string[],
  validateProfiles: SchemaValidator,
): { profiles: Profiles | undefined; problems: Problem[] } {
  const file = join(root, PROFILES_PATH);
  if (!existsSync(file)) {
    return {
      profiles: undefined,
      problems:
        sharedSkills.length === 0
          ? []
          : [
              {
                file: PROFILES_PATH,
                message: "is missing, so the shared skills can't belong to a profile",
              },
            ],
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    return {
      profiles: undefined,
      problems: [{ file: PROFILES_PATH, message: `isn't valid JSON: ${(error as Error).message}` }],
    };
  }
  const schemaProblems = validateProfiles(parsed);
  if (schemaProblems.length > 0) {
    return {
      profiles: undefined,
      problems: schemaProblems.map((p) => ({
        file: PROFILES_PATH,
        message: `${p.path} ${p.message}`,
      })),
    };
  }

  const profiles = parsed as Profiles;
  const problems: Problem[] = [];
  const shared = new Set(sharedSkills);
  const inAProfile = new Set<string>();
  for (const [profile, { skills }] of Object.entries(profiles.profiles)) {
    for (const skill of skills) {
      inAProfile.add(skill);
      if (!shared.has(skill)) {
        problems.push({
          file: PROFILES_PATH,
          message: `profile "${profile}" lists ${skill}, which isn't a shared skill in skills/central/`,
        });
      }
    }
  }
  for (const skill of sharedSkills.filter((name) => !inAProfile.has(name))) {
    problems.push({
      file: PROFILES_PATH,
      message: `doesn't list ${skill} in any profile, so no repository could receive it`,
    });
  }
  return { profiles, problems };
}
