import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join } from 'node:path';
import { LINKS_DIR, SKILLS_DIR } from './manifest.ts';

// Claude Code doesn't read .agents/skills/, so each skill gets a relative link from .claude/skills/.
export function linkPath(name: string): string {
  return `${LINKS_DIR}/${name}`;
}

export function linkTarget(name: string): string {
  return `../../${SKILLS_DIR}/${name}`;
}

export interface LinkPlan {
  create: string[];
  // Links sync made before, now pointing somewhere else.
  replace: string[];
  keep: string[];
  // Links sync made before, for skills no longer in the set.
  remove: string[];
  // Wanted links whose place is taken by something sync didn't make, which it leaves alone.
  conflicts: string[];
  // Anything else in .claude/skills/ that sync didn't make.
  unmanaged: string[];
}

type Entry = { kind: 'missing' } | { kind: 'link'; target: string } | { kind: 'other' };

function inspect(root: string, name: string): Entry {
  const path = join(root, linkPath(name));
  let stats;
  try {
    stats = lstatSync(path);
  } catch {
    return { kind: 'missing' };
  }
  return stats.isSymbolicLink() ? { kind: 'link', target: readlinkSync(path) } : { kind: 'other' };
}

// previous holds the names whose links the last sync recorded in the manifest.
export function planLinks(
  root: string,
  wanted: readonly string[],
  previous: readonly string[],
): LinkPlan {
  const plan: LinkPlan = {
    create: [],
    replace: [],
    keep: [],
    remove: [],
    conflicts: [],
    unmanaged: [],
  };
  const managedBefore = new Set(previous);
  for (const name of wanted) {
    const entry = inspect(root, name);
    if (entry.kind === 'missing') plan.create.push(name);
    else if (entry.kind === 'link' && entry.target === linkTarget(name)) plan.keep.push(name);
    else if (entry.kind === 'link' && managedBefore.has(name)) plan.replace.push(name);
    else plan.conflicts.push(name);
  }

  const dir = join(root, LINKS_DIR);
  const present = existsSync(dir) ? readdirSync(dir).sort() : [];
  const wantedSet = new Set(wanted);
  for (const name of present.filter((entry) => !wantedSet.has(entry))) {
    if (managedBefore.has(name) && inspect(root, name).kind === 'link') plan.remove.push(name);
    else plan.unmanaged.push(name);
  }
  return plan;
}

export function applyLinks(root: string, plan: LinkPlan): void {
  mkdirSync(join(root, LINKS_DIR), { recursive: true });
  for (const name of [...plan.replace, ...plan.remove]) rmSync(join(root, linkPath(name)));
  for (const name of [...plan.create, ...plan.replace]) {
    symlinkSync(linkTarget(name), join(root, linkPath(name)), 'dir');
  }
}
