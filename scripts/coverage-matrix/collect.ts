import { parse } from 'yaml';
import { PACKAGE_NAME, readDependabot, readReleaseAge } from '../../src/lib/settings-files.ts';
import type { Api } from './api.ts';

// Packages that mean a repository renders an interface, so it should have the frontend profile.
export const UI_FRAMEWORKS = [
  'react',
  'react-dom',
  'next',
  'vue',
  'nuxt',
  'svelte',
  '@sveltejs/kit',
  '@angular/core',
  'solid-js',
  'preact',
  'astro',
  'lit',
];

// pnpm 9, 10 and 11 all write lockfile version 9.0. Anything else might list dependencies
// differently, so the scan stops rather than guess.
const LOCKFILE_VERSIONS = ['9.0'];

export interface Row {
  repository: string;
  // The installed version, from the lockfile.
  version: string | undefined;
  // The version the committed skills were synced from, from the manifest.
  syncedVersion: string | undefined;
  profiles: string[];
  bundle: string | undefined;
  skills: number | undefined;
  // The open Dependabot pull request updating the package, and how many days it has been open.
  openUpdate: { number: number; days: number } | undefined;
  // Days from opening to merging the most recent merged update.
  lastMergeDays: number | undefined;
  flags: string[];
}

export interface Options {
  org: string;
  sandbox: string;
  // During the sandbox rehearsal, the sandbox is scanned like any other repository.
  includeSandbox: boolean;
  now: Date;
}

const DAY = 24 * 60 * 60 * 1000;
const days = (from: string, to: Date) =>
  Math.floor((to.getTime() - new Date(from).getTime()) / DAY);

interface Lockfile {
  lockfileVersion?: unknown;
  importers?: Record<
    string,
    Partial<
      Record<
        'dependencies' | 'devDependencies' | 'optionalDependencies',
        Record<string, { version?: string }>
      >
    >
  >;
}

function readLockfile(
  repo: string,
  text: string,
): { dependencies: Set<string>; version: string | undefined } {
  const lockfile = parse(text) as Lockfile | null;
  const raw = lockfile?.lockfileVersion;
  const lockfileVersion = typeof raw === 'string' || typeof raw === 'number' ? String(raw) : 'none';
  if (!LOCKFILE_VERSIONS.includes(lockfileVersion)) {
    throw new Error(
      `${repo}'s pnpm-lock.yaml has lockfileVersion ${lockfileVersion}, which the coverage matrix doesn't recognise.`,
    );
  }
  const dependencies = new Set<string>();
  let version: string | undefined;
  for (const [importer, sections] of Object.entries(lockfile?.importers ?? {})) {
    for (const section of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
      for (const [name, entry] of Object.entries(sections[section] ?? {})) {
        dependencies.add(name);
        // The version can carry peer dependencies in brackets.
        if (importer === '.' && name === PACKAGE_NAME)
          version = entry.version?.replace(/\(.*$/, '');
      }
    }
  }
  return { dependencies, version };
}

export async function collect(api: Api, options: Options): Promise<Row[]> {
  const { org } = options;
  const repositories = (await api.listRepositories(org))
    .filter((repo) => !repo.archived && (options.includeSandbox || repo.name !== options.sandbox))
    .map((repo) => repo.name)
    .sort((a, b) => a.localeCompare(b));

  const rows: Row[] = [];
  for (const name of repositories) {
    const packageText = await api.readFile(org, name, 'package.json');
    if (packageText === undefined) continue;
    let packageJson: Record<string, unknown>;
    try {
      packageJson = JSON.parse(packageText) as Record<string, unknown>;
    } catch {
      continue;
    }
    const inSection = (section: string) => {
      const deps = packageJson[section];
      return typeof deps === 'object' && deps !== null && PACKAGE_NAME in deps;
    };
    if (!inSection('devDependencies') && !inSection('dependencies')) continue;

    const flags: string[] = [];
    const [lockText, manifestText, workspaceText, dependabotText, dependabotYaml, pulls] =
      await Promise.all([
        api.readFile(org, name, 'pnpm-lock.yaml'),
        api.readFile(org, name, '.agents/skills/.oak-manifest.json'),
        api.readFile(org, name, 'pnpm-workspace.yaml'),
        api.readFile(org, name, '.github/dependabot.yml'),
        api.readFile(org, name, '.github/dependabot.yaml'),
        api.pullRequests(org, name),
      ]);

    let lock: ReturnType<typeof readLockfile> = { dependencies: new Set(), version: undefined };
    if (lockText === undefined) flags.push('No pnpm-lock.yaml');
    else lock = readLockfile(name, lockText);

    const oakSkills = (packageJson.oakSkills ?? {}) as { profiles?: unknown; bundle?: unknown };
    const profiles = Array.isArray(oakSkills.profiles) ? oakSkills.profiles.map(String) : [];
    const bundle = typeof oakSkills.bundle === 'string' ? oakSkills.bundle : undefined;
    let manifest: { package?: { version?: string }; skills?: Record<string, unknown> } | undefined;
    try {
      manifest =
        manifestText === undefined ? undefined : (JSON.parse(manifestText) as typeof manifest);
    } catch {
      flags.push('Unreadable sync manifest');
    }

    const ui = UI_FRAMEWORKS.filter((framework) => lock.dependencies.has(framework));
    if (ui.length > 0 && !profiles.includes('frontend')) {
      flags.push(`Uses ${ui.join(', ')} but not the frontend profile`);
    }
    if (workspaceText !== undefined) {
      const releaseAge = readReleaseAge(workspaceText);
      if (releaseAge.minutes !== undefined && !releaseAge.exempt) {
        flags.push('minimumReleaseAge without an exemption for the package');
      }
    }
    const dependabot = dependabotText ?? dependabotYaml;
    if (dependabot !== undefined) {
      const settings = readDependabot(dependabot);
      if (settings.hasCooldown && !settings.cooldownExempt) {
        flags.push('Dependabot cooldown without an exemption for the package');
      }
    }
    if (typeof packageJson.packageManager !== 'string') flags.push('No packageManager field');
    if (inSection('dependencies'))
      flags.push('The package is in dependencies, not devDependencies');

    const updates = pulls.filter(
      (pull) => pull.author === 'dependabot[bot]' && pull.title.includes(PACKAGE_NAME),
    );
    const open = updates.find((pull) => pull.state === 'open');
    const merged = updates.find((pull) => pull.mergedAt !== null);

    rows.push({
      repository: name,
      version: lock.version,
      syncedVersion: manifest?.package?.version,
      profiles,
      bundle,
      skills: manifest?.skills === undefined ? undefined : Object.keys(manifest.skills).length,
      openUpdate:
        open === undefined
          ? undefined
          : { number: open.number, days: days(open.createdAt, options.now) },
      lastMergeDays:
        merged?.mergedAt == null ? undefined : days(merged.createdAt, new Date(merged.mergedAt)),
      flags,
    });
  }

  // A bundle belongs to one repository, so two claiming the same one is a mistake.
  const byBundle = new Map<string, string[]>();
  for (const row of rows) {
    if (row.bundle !== undefined)
      byBundle.set(row.bundle, [...(byBundle.get(row.bundle) ?? []), row.repository]);
  }
  for (const row of rows) {
    const sharing = (row.bundle === undefined ? [] : (byBundle.get(row.bundle) ?? [])).filter(
      (other) => other !== row.repository,
    );
    if (sharing.length > 0)
      row.flags.push(`Bundle "${String(row.bundle)}" is also claimed by ${sharing.join(', ')}`);
  }
  return rows;
}
