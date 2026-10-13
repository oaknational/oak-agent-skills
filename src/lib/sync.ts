import { cpSync, existsSync, lstatSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_DIR, readCatalogue } from './catalogue.ts';
import { hashFolder } from './hash.ts';
import {
  MANIFEST_PATH,
  readManifest,
  serialiseManifest,
  SKILLS_DIR,
  writeManifest,
  type Manifest,
} from './manifest.ts';
import { readPackageInfo } from './package-info.ts';
import { readOakSkillsConfig, resolveSkills, type ResolvedSkill } from './profiles.ts';
import { findRepositoryRoot, readRootPackageJson } from './root.ts';
import { applyLinks, linkPath, linkTarget, planLinks, type LinkPlan } from './shims.ts';

export interface SyncPlan {
  root: string;
  packageDir: string;
  version: string;
  add: ResolvedSkill[];
  update: ResolvedSkill[];
  unchanged: string[];
  remove: string[];
  // Wanted skills whose folder holds something sync didn't write, which it leaves alone.
  conflicts: string[];
  // Anything else in .agents/skills/ that sync didn't write.
  unmanaged: string[];
  links: LinkPlan;
  // Files with local edits that this sync replaces or removes, for a warning.
  replacedEdits: string[];
  warnings: string[];
  manifest: Manifest;
  manifestChanged: boolean;
}

function filesDiffer(a: Record<string, string>, b: Record<string, string>): string[] {
  const names = new Set([...Object.keys(a), ...Object.keys(b)]);
  return [...names].filter((name) => a[name] !== b[name]).sort();
}

function isFolder(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function planSync(cwd: string, packageDir: string = PACKAGE_DIR): SyncPlan {
  const root = findRepositoryRoot(cwd);
  const config = readOakSkillsConfig(readRootPackageJson(root));
  const catalogue = readCatalogue(packageDir);
  const { skills, warnings } = resolveSkills(config, catalogue);
  const info = readPackageInfo(pathToFileURL(join(packageDir, 'package.json')));
  const previous = readManifest(root);
  const managedBefore = previous?.skills ?? {};

  const plan: Pick<
    SyncPlan,
    'add' | 'update' | 'unchanged' | 'remove' | 'conflicts' | 'replacedEdits'
  > = {
    add: [],
    update: [],
    unchanged: [],
    remove: [],
    conflicts: [],
    replacedEdits: [],
  };
  const synced: Manifest['skills'] = {};

  for (const skill of skills) {
    const target = join(root, SKILLS_DIR, skill.name);
    const source = hashFolder(join(packageDir, skill.source));
    if (!existsSync(target)) {
      plan.add.push(skill);
    } else {
      const current = isFolder(target) ? hashFolder(target) : undefined;
      const recorded = managedBefore[skill.name];
      if (current !== undefined && filesDiffer(current, source).length === 0) {
        // Identical to the package, whether or not a previous sync recorded it.
        plan.unchanged.push(skill.name);
      } else if (recorded !== undefined && current !== undefined) {
        plan.update.push(skill);
        for (const file of filesDiffer(current, recorded.files)) {
          plan.replacedEdits.push(`${SKILLS_DIR}/${skill.name}/${file}`);
        }
      } else {
        plan.conflicts.push(skill.name);
        continue;
      }
    }
    synced[skill.name] = { source: skill.source, files: source };
  }

  const wanted = new Set(skills.map((skill) => skill.name));
  for (const [name, recorded] of Object.entries(managedBefore)) {
    if (wanted.has(name)) continue;
    const target = join(root, SKILLS_DIR, name);
    if (!isFolder(target)) continue;
    plan.remove.push(name);
    for (const file of filesDiffer(hashFolder(target), recorded.files)) {
      plan.replacedEdits.push(`${SKILLS_DIR}/${name}/${file}`);
    }
  }

  const skillsDir = join(root, SKILLS_DIR);
  const unmanaged = existsSync(skillsDir)
    ? readdirSync(skillsDir)
        .filter(
          (entry) =>
            entry !== '.oak-manifest.json' && !wanted.has(entry) && !plan.remove.includes(entry),
        )
        .sort()
    : [];

  const linked = Object.keys(synced).sort();
  const links = planLinks(
    root,
    linked,
    (previous?.symlinks ?? []).map((link) => link.path.replace(/^\.claude\/skills\//, '')),
  );
  const manifest: Manifest = {
    manifestVersion: 1,
    package: { name: info.name, version: info.version },
    config: {
      profiles: config.profiles,
      bundle: config.bundle ?? null,
      include: config.include,
      exclude: config.exclude,
    },
    skills: synced,
    symlinks: linked
      .filter((name) => !links.conflicts.includes(name))
      .map((name) => ({ path: linkPath(name), target: linkTarget(name) })),
  };
  const manifestFile = join(root, MANIFEST_PATH);
  const manifestChanged =
    !existsSync(manifestFile) || readFileSync(manifestFile, 'utf8') !== serialiseManifest(manifest);

  return {
    root,
    packageDir,
    version: info.version,
    ...plan,
    unmanaged,
    links,
    warnings,
    manifest,
    manifestChanged,
  };
}

export function hasChanges(plan: SyncPlan): boolean {
  const { links } = plan;
  return (
    plan.add.length + plan.update.length + plan.remove.length > 0 ||
    links.create.length + links.replace.length + links.remove.length > 0 ||
    plan.manifestChanged
  );
}

export function applySync(plan: SyncPlan): void {
  for (const name of plan.remove) {
    rmSync(join(plan.root, SKILLS_DIR, name), { recursive: true, force: true });
  }
  for (const skill of [...plan.add, ...plan.update]) {
    const target = join(plan.root, SKILLS_DIR, skill.name);
    rmSync(target, { recursive: true, force: true });
    cpSync(join(plan.packageDir, skill.source), target, { recursive: true });
  }
  applyLinks(plan.root, plan.links);
  if (plan.manifestChanged) writeManifest(plan.root, plan.manifest);
}
