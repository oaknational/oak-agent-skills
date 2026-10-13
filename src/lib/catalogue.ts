import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OakSkillsError } from './errors.ts';

// The installed package's own folder, two levels up from src/lib or dist/lib.
export const PACKAGE_DIR = fileURLToPath(new URL('../../', import.meta.url));

export interface Catalogue {
  // The package folder the skills were read from.
  dir: string;
  profiles: Map<string, string[]>;
  shared: Set<string>;
  bundles: Map<string, string[]>;
}

function folders(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

// Reads the skills the package ships: skills/profiles.json, skills/central/ and skills/repos/.
export function readCatalogue(dir: string = PACKAGE_DIR): Catalogue {
  const profilesFile = join(dir, 'skills/profiles.json');
  if (!existsSync(profilesFile)) {
    throw new OakSkillsError(
      `The installed package has no skills/profiles.json at ${profilesFile}.`,
      {
        hint: 'Reinstall @oaknational/oak-agent-skills.',
      },
    );
  }
  const parsed = JSON.parse(readFileSync(profilesFile, 'utf8')) as {
    profiles?: Record<string, { skills?: string[] }>;
  };
  const profiles = new Map(
    Object.entries(parsed.profiles ?? {}).map(([name, profile]) => [name, profile.skills ?? []]),
  );
  const bundles = new Map(
    folders(join(dir, 'skills/repos')).map((code) => [
      code,
      folders(join(dir, 'skills/repos', code)),
    ]),
  );
  return { dir, profiles, shared: new Set(folders(join(dir, 'skills/central'))), bundles };
}
