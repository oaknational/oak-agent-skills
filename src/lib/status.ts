import { lstatSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_DIR, readCatalogue } from './catalogue.ts';
import { OakSkillsError } from './errors.ts';
import { ExitCode } from './exit-codes.ts';
import { filesDiffer, hashFolder } from './hash.ts';
import {
  LINKS_DIR,
  MANIFEST_PATH,
  readManifest,
  SKILLS_DIR,
  type Manifest,
  type ManifestSkill,
} from './manifest.ts';
import { readPackageInfo } from './package-info.ts';
import { readOakSkillsConfig, resolveSkills, type ResolvedSkill } from './profiles.ts';
import { findRepositoryRoot, readRootPackageJson } from './root.ts';
import { linkPath, linkTarget } from './shims.ts';
import {
  LINKED_FOLDER_HINT,
  linkedSkillFolder,
  readSkillFolders,
  type SkillFolders,
} from './skill-folders.ts';

export interface StatusReport {
  root: string;
  toolVersion: string;
  syncedVersion: string | undefined;
  // Exit code 5: oakSkills can't be resolved, so nothing else can be trusted fully.
  configProblems: string[];
  // Exit code 2: the committed skills don't match what sync would write now.
  outOfDate: string[];
  // Exit code 1: synced files, links or the manifest changed since the last sync.
  edited: string[];
  // Exit code 4: things in the skill folders that sync didn't write.
  unmanaged: string[];
  // Skills whose every file and link matches the installed package.
  clean: string[];
}

function linkProblem(root: string, path: string, target: string): string | undefined {
  try {
    const stats = lstatSync(join(root, path));
    if (!stats.isSymbolicLink()) return `${path} has been replaced by something that isn't a link`;
    if (readlinkSync(join(root, path)) !== target) return `${path} points somewhere else now`;
    return undefined;
  } catch {
    return `${path} has been deleted`;
  }
}

function isFolder(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

interface Comparison {
  root: string;
  packageDir: string;
  manifest: Manifest;
  folders: SkillFolders;
  wanted: ResolvedSkill[] | undefined;
  sameVersion: boolean;
  toolVersion: string;
}

function expectedFiles(
  { packageDir, wanted, sameVersion, toolVersion }: Comparison,
  name: string,
  skill: ManifestSkill,
  edited: string[],
): Record<string, string> {
  if (!sameVersion) return skill.files;
  const source = wanted?.find((candidate) => candidate.name === name)?.source ?? skill.source;
  if (source !== skill.source) {
    edited.push(`${MANIFEST_PATH} says ${name} comes from ${skill.source}, not ${source}`);
  }
  if (!isFolder(join(packageDir, source))) return skill.files;
  const files = hashFolder(join(packageDir, source));
  if (filesDiffer(skill.files, files).length > 0) {
    edited.push(
      `${MANIFEST_PATH} has checksums for ${name} that don't match version ${toolVersion}`,
    );
  }
  return files;
}

function compareSkills(comparison: Comparison, report: StatusReport): void {
  const { root, manifest, folders } = comparison;
  const linked = new Set<string>();
  const manifestProblems: string[] = [];
  for (const link of manifest.symlinks) {
    const name = link.path.slice(`${LINKS_DIR}/`.length);
    if (Object.hasOwn(manifest.skills, name) && link.target === linkTarget(name)) linked.add(name);
    else manifestProblems.push(`${MANIFEST_PATH} lists a link sync doesn't make: ${link.path}`);
  }

  for (const [name, skill] of Object.entries(manifest.skills).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const problems: string[] = [];
    const expected = expectedFiles(comparison, name, skill, problems);
    const state = folders.read(name);
    const changed = filesDiffer(state?.files ?? {}, expected);
    const changes = [
      ...changed.map((file) => `${SKILLS_DIR}/${name}/${file}`),
      ...(state?.others ?? []).map(
        (other) =>
          `${SKILLS_DIR}/${name}/${other} is a link or special file, which sync never writes`,
      ),
      ...problems,
    ];
    const brokenLink = linked.has(name)
      ? linkProblem(root, linkPath(name), linkTarget(name))
      : undefined;
    if (brokenLink !== undefined) changes.push(brokenLink);
    report.edited.push(...changes);
    if (changes.length === 0) report.clean.push(name);
  }
  report.edited.push(...manifestProblems);

  for (const entry of folders.skillEntries) {
    if (entry !== '.oak-manifest.json' && !Object.hasOwn(manifest.skills, entry))
      report.unmanaged.push(`${SKILLS_DIR}/${entry}`);
  }
  for (const entry of folders.linkEntries) {
    if (!linked.has(entry)) report.unmanaged.push(`${LINKS_DIR}/${entry}`);
  }
}

export function computeStatus(cwd: string, packageDir: string = PACKAGE_DIR): StatusReport {
  const root = findRepositoryRoot(cwd);
  const packageJson = readRootPackageJson(root);
  const toolVersion = readPackageInfo(pathToFileURL(join(packageDir, 'package.json'))).version;
  const linkedFolder = linkedSkillFolder(root);
  const manifest = linkedFolder === undefined ? readManifest(root) : undefined;
  const report: StatusReport = {
    root,
    toolVersion,
    syncedVersion: manifest?.package.version,
    configProblems: [],
    outOfDate: [],
    edited: [],
    unmanaged: [],
    clean: [],
  };
  if (linkedFolder !== undefined) {
    report.configProblems.push(`${linkedFolder} ${LINKED_FOLDER_HINT}`);
    return report;
  }

  let wanted: ResolvedSkill[] | undefined;
  try {
    const config = readOakSkillsConfig(packageJson);
    wanted = resolveSkills(config, readCatalogue(packageDir)).skills;
  } catch (error) {
    if (!(error instanceof OakSkillsError) || error.exitCode !== ExitCode.Configuration)
      throw error;
    report.configProblems.push(
      error.hint === undefined ? error.message : `${error.message} ${error.hint}`,
    );
  }

  const folders = readSkillFolders(root);
  if (manifest === undefined) {
    report.outOfDate.push('No skills have been synced yet.');
    // Without the manifest, entries named after wanted skills are most likely synced copies, which
    // sync takes back or reports itself, so the fix is to sync rather than to remove them.
    const wantedNames = new Set(wanted?.map((skill) => skill.name));
    for (const [dir, entries] of [
      [SKILLS_DIR, folders.skillEntries],
      [LINKS_DIR, folders.linkEntries],
    ] as const) {
      for (const entry of entries) {
        if (!wantedNames.has(entry)) report.unmanaged.push(`${dir}/${entry}`);
      }
    }
    return report;
  }

  const sameVersion = manifest.package.version === toolVersion;
  if (!sameVersion) {
    report.outOfDate.push(
      `The skills were synced from version ${manifest.package.version}, but version ${toolVersion} is installed.`,
    );
  }
  if (wanted !== undefined) {
    const wantedNames = wanted.map((skill) => skill.name);
    const synced = Object.keys(manifest.skills);
    const missing = wantedNames.filter((name) => !synced.includes(name));
    const extra = synced.filter((name) => !wantedNames.includes(name));
    if (missing.length > 0)
      report.outOfDate.push(`oakSkills now includes ${missing.join(', ')}, which isn't synced.`);
    if (extra.length > 0)
      report.outOfDate.push(`${extra.join(', ')} is synced, but oakSkills no longer includes it.`);
  }
  compareSkills({ root, packageDir, manifest, folders, wanted, sameVersion, toolVersion }, report);
  return report;
}

// When several problems apply, the highest code wins.
export function statusExitCode(report: StatusReport): number {
  if (report.configProblems.length > 0) return ExitCode.Configuration;
  if (report.unmanaged.length > 0) return ExitCode.Unmanaged;
  const edited = report.edited.length > 0;
  const outOfDate = report.outOfDate.length > 0;
  if (edited && outOfDate) return ExitCode.EditedAndVersionMismatch;
  if (outOfDate) return ExitCode.VersionMismatch;
  if (edited) return ExitCode.Edited;
  return ExitCode.Ok;
}
