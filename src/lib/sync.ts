import { cpSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_DIR, readCatalogue } from './catalogue.ts';
import { filesDiffer, hashFolder } from './hash.ts';
import {
  MANIFEST_PATH,
  readManifest,
  serialiseManifest,
  SKILLS_DIR,
  writeManifest,
  type Manifest,
} from './manifest.ts';
import { readPackageInfo } from './package-info.ts';
import {
  readOakSkillsConfig,
  resolveSkills,
  type OakSkillsConfig,
  type ResolvedSkill,
} from './profiles.ts';
import { findRepositoryRoot, readRootPackageJson } from './root.ts';
import { applyLinks, linkPath, linkTarget, planLinks, type LinkPlan } from './shims.ts';
import { assertRealSkillFolders, readSkillFolders, type FolderState } from './skill-folders.ts';

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

function localChanges(
  name: string,
  state: FolderState,
  recorded: Record<string, string>,
): string[] {
  return [...filesDiffer(state.files, recorded), ...state.others].map(
    (path) => `${SKILLS_DIR}/${name}/${path}`,
  );
}

// config replaces the settings in package.json, so init can plan a sync before writing them.
export function planSync(
  cwd: string,
  packageDir: string = PACKAGE_DIR,
  config?: OakSkillsConfig,
): SyncPlan {
  const root = findRepositoryRoot(cwd);
  assertRealSkillFolders(root);
  config ??= readOakSkillsConfig(readRootPackageJson(root));
  const catalogue = readCatalogue(packageDir);
  const { skills, warnings } = resolveSkills(config, catalogue);
  const info = readPackageInfo(pathToFileURL(join(packageDir, 'package.json')));
  const previous = readManifest(root);
  const managedBefore = previous?.skills ?? {};
  const folders = readSkillFolders(root);

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
      const current = folders.read(skill.name);
      const recorded = Object.hasOwn(managedBefore, skill.name)
        ? managedBefore[skill.name]
        : undefined;
      if (current?.others.length === 0 && filesDiffer(current.files, source).length === 0) {
        // Identical to the package, whether or not a previous sync recorded it.
        plan.unchanged.push(skill.name);
      } else if (recorded !== undefined && current !== undefined) {
        plan.update.push(skill);
        plan.replacedEdits.push(...localChanges(skill.name, current, recorded.files));
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
    const current = folders.read(name);
    if (current === undefined) continue;
    plan.remove.push(name);
    plan.replacedEdits.push(...localChanges(name, current, recorded.files));
  }

  const unmanaged = folders.skillEntries.filter(
    (entry) => entry !== '.oak-manifest.json' && !wanted.has(entry) && !plan.remove.includes(entry),
  );

  const linked = Object.keys(synced).sort();
  const links = planLinks(
    root,
    linked,
    (previous?.symlinks ?? []).map((link) => link.path.replace(/^\.claude\/skills\//, '')),
  );
  links.unmanaged = links.unmanaged.filter((name) => folders.linkEntries.includes(name));
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

// A second guard before deleting anything: the manifest check should already have rejected such a name.
function skillFolder(root: string, name: string): string {
  const dir = resolve(root, SKILLS_DIR);
  const folder = resolve(dir, name);
  if (dirname(folder) !== dir) throw new Error(`Refusing to change ${folder}, outside ${dir}.`);
  return folder;
}

export function applySync(plan: SyncPlan): void {
  for (const name of plan.remove) {
    rmSync(skillFolder(plan.root, name), { recursive: true, force: true });
  }
  for (const skill of [...plan.add, ...plan.update]) {
    const target = skillFolder(plan.root, skill.name);
    rmSync(target, { recursive: true, force: true });
    cpSync(join(plan.packageDir, skill.source), target, { recursive: true });
  }
  applyLinks(plan.root, plan.links);
  if (plan.manifestChanged) writeManifest(plan.root, plan.manifest);
}
