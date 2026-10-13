import { existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_DIR, readCatalogue } from './catalogue.ts';
import { OakSkillsError } from './errors.ts';
import { ExitCode } from './exit-codes.ts';
import { hashFolder } from './hash.ts';
import { LINKS_DIR, readManifest, SKILLS_DIR, type Manifest } from './manifest.ts';
import { readPackageInfo } from './package-info.ts';
import { readOakSkillsConfig, resolveSkills } from './profiles.ts';
import { findRepositoryRoot, readRootPackageJson } from './root.ts';

export interface StatusReport {
  root: string;
  toolVersion: string;
  syncedVersion: string | undefined;
  // Exit code 5: oakSkills can't be resolved, so nothing else can be trusted fully.
  configProblems: string[];
  // Exit code 2: the committed skills don't match what sync would write now.
  outOfDate: string[];
  // Exit code 1: managed files or links changed since the last sync.
  edited: string[];
  // Exit code 4: things in the skill folders that sync didn't write.
  unmanaged: string[];
  // Skills whose every file and link matches the manifest.
  clean: string[];
}

function filesChanged(dir: string, recorded: Record<string, string>): string[] {
  let current: Record<string, string> = {};
  try {
    if (lstatSync(dir).isDirectory()) current = hashFolder(dir);
  } catch {
    // A missing folder means every recorded file is missing.
  }
  const names = new Set([...Object.keys(current), ...Object.keys(recorded)]);
  return [...names].filter((name) => current[name] !== recorded[name]).sort();
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

function entries(root: string, dir: string): string[] {
  const full = join(root, dir);
  return existsSync(full) ? readdirSync(full).sort() : [];
}

function compareWithManifest(root: string, manifest: Manifest, report: StatusReport): void {
  for (const [name, skill] of Object.entries(manifest.skills).sort(([a], [b]) =>
    a < b ? -1 : 1,
  )) {
    const changed = filesChanged(join(root, SKILLS_DIR, name), skill.files);
    const link = manifest.symlinks.find((candidate) => candidate.path === `${LINKS_DIR}/${name}`);
    const brokenLink = link === undefined ? undefined : linkProblem(root, link.path, link.target);
    for (const file of changed) report.edited.push(`${SKILLS_DIR}/${name}/${file}`);
    if (brokenLink !== undefined) report.edited.push(brokenLink);
    if (changed.length === 0 && brokenLink === undefined) report.clean.push(name);
  }
  const managedLinks = new Set(manifest.symlinks.map((link) => link.path));
  for (const entry of entries(root, SKILLS_DIR)) {
    if (entry !== '.oak-manifest.json' && !(entry in manifest.skills))
      report.unmanaged.push(`${SKILLS_DIR}/${entry}`);
  }
  for (const entry of entries(root, LINKS_DIR)) {
    if (!managedLinks.has(`${LINKS_DIR}/${entry}`)) report.unmanaged.push(`${LINKS_DIR}/${entry}`);
  }
}

export function computeStatus(cwd: string, packageDir: string = PACKAGE_DIR): StatusReport {
  const root = findRepositoryRoot(cwd);
  const packageJson = readRootPackageJson(root);
  const toolVersion = readPackageInfo(pathToFileURL(join(packageDir, 'package.json'))).version;
  const manifest = readManifest(root);
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

  let wanted: string[] | undefined;
  try {
    const config = readOakSkillsConfig(packageJson);
    wanted = resolveSkills(config, readCatalogue(packageDir)).skills.map((skill) => skill.name);
  } catch (error) {
    if (!(error instanceof OakSkillsError) || error.exitCode !== ExitCode.Configuration)
      throw error;
    report.configProblems.push(
      error.hint === undefined ? error.message : `${error.message} ${error.hint}`,
    );
  }

  if (manifest === undefined) {
    report.outOfDate.push('No skills have been synced yet.');
    for (const dir of [SKILLS_DIR, LINKS_DIR]) {
      for (const entry of entries(root, dir)) report.unmanaged.push(`${dir}/${entry}`);
    }
    return report;
  }

  if (manifest.package.version !== toolVersion) {
    report.outOfDate.push(
      `The skills were synced from version ${manifest.package.version}, but version ${toolVersion} is installed.`,
    );
  }
  if (wanted !== undefined) {
    const synced = Object.keys(manifest.skills);
    const missing = wanted.filter((name) => !synced.includes(name));
    const extra = synced.filter((name) => !wanted.includes(name));
    if (missing.length > 0)
      report.outOfDate.push(`oakSkills now includes ${missing.join(', ')}, which isn't synced.`);
    if (extra.length > 0)
      report.outOfDate.push(`${extra.join(', ')} is synced, but oakSkills no longer includes it.`);
  }
  compareWithManifest(root, manifest, report);
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
