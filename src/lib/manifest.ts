import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { OakSkillsError } from './errors.ts';
import { ExitCode } from './exit-codes.ts';

export const SKILLS_DIR = '.agents/skills';
export const LINKS_DIR = '.claude/skills';
export const MANIFEST_PATH = `${SKILLS_DIR}/.oak-manifest.json`;

export interface ManifestSkill {
  // The skill's folder in the package and the central repository.
  source: string;
  // Paths relative to the skill's folder, with their SHA-256 checksums.
  files: Record<string, string>;
}

export interface Manifest {
  manifestVersion: 1;
  package: { name: string; version: string };
  config: { profiles: string[]; bundle: string | null; include: string[]; exclude: string[] };
  skills: Record<string, ManifestSkill>;
  symlinks: { path: string; target: string }[];
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isStringList = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');
const isStringMap = (value: unknown): value is Record<string, string> =>
  isObject(value) && Object.values(value).every((item) => typeof item === 'string');

// A light check of the shape, because consuming repositories don't install a schema validator.
// schema/manifest.schema.json is the full definition.
function isManifest(value: unknown): value is Manifest {
  if (!isObject(value) || value.manifestVersion !== 1) return false;
  const { package: pkg, config, skills, symlinks } = value;
  return (
    isObject(pkg) &&
    typeof pkg.name === 'string' &&
    typeof pkg.version === 'string' &&
    isObject(config) &&
    isStringList(config.profiles) &&
    (config.bundle === null || typeof config.bundle === 'string') &&
    isStringList(config.include) &&
    isStringList(config.exclude) &&
    isObject(skills) &&
    Object.values(skills).every(
      (skill) => isObject(skill) && typeof skill.source === 'string' && isStringMap(skill.files),
    ) &&
    Array.isArray(symlinks) &&
    symlinks.every(
      (link) => isObject(link) && typeof link.path === 'string' && typeof link.target === 'string',
    )
  );
}

export function readManifest(root: string): Manifest | undefined {
  const file = join(root, MANIFEST_PATH);
  if (!existsSync(file)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new OakSkillsError(`${MANIFEST_PATH} isn't valid JSON: ${(error as Error).message}`, {
      exitCode: ExitCode.Configuration,
      hint: 'Restore it from git, or run "oak-skills sync" to write it again.',
    });
  }
  if (!isManifest(parsed)) {
    throw new OakSkillsError(`${MANIFEST_PATH} isn't a manifest oak-skills recognises.`, {
      exitCode: ExitCode.Configuration,
      hint: 'Restore it from git, or run "oak-skills sync" to write it again.',
    });
  }
  return parsed;
}

function sortedRecord<T>(
  record: Record<string, T>,
  map: (value: T) => T = (value) => value,
): Record<string, T> {
  return Object.fromEntries(
    Object.keys(record)
      .sort()
      .map((key) => [key, map(record[key] as T)]),
  );
}

// Keys are sorted, so the same sync always writes the same bytes.
export function serialiseManifest(manifest: Manifest): string {
  const ordered: Manifest = {
    manifestVersion: 1,
    package: { name: manifest.package.name, version: manifest.package.version },
    config: {
      profiles: manifest.config.profiles,
      bundle: manifest.config.bundle,
      include: manifest.config.include,
      exclude: manifest.config.exclude,
    },
    skills: sortedRecord(manifest.skills, (skill) => ({
      source: skill.source,
      files: sortedRecord(skill.files),
    })),
    symlinks: [...manifest.symlinks]
      .sort((a, b) => (a.path < b.path ? -1 : 1))
      .map(({ path, target }) => ({ path, target })),
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function writeManifest(root: string, manifest: Manifest): void {
  const file = join(root, MANIFEST_PATH);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, serialiseManifest(manifest));
}
