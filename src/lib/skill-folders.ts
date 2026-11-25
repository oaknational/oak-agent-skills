import { existsSync, lstatSync, readdirSync, readlinkSync } from 'node:fs';
import { join, relative } from 'node:path';
import { OakSkillsError } from './errors.ts';
import { ExitCode } from './exit-codes.ts';
import { listFolder } from './files.ts';
import { ignoredByGit } from './git.ts';
import { hashFile } from './hash.ts';
import { LINKS_DIR, SKILLS_DIR } from './manifest.ts';

export interface FolderState {
  files: Record<string, string>;
  others: string[];
  ignored: string[];
}

export interface SkillFolders {
  skillEntries: string[];
  linkEntries: string[];
  read: (name: string) => FolderState | undefined;
}

export const LINKED_FOLDER_HINT = 'Remove the link, then run "oak-skills sync".';

export function linkedSkillFolder(root: string): string | undefined {
  for (const dir of [SKILLS_DIR, LINKS_DIR]) {
    const path = join(root, dir);
    if (lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true) {
      return `${dir} is a link to ${readlinkSync(path)}. oak-skills keeps the skills in ${SKILLS_DIR}/ and makes one link per skill in ${LINKS_DIR}/, so both must be real folders.`;
    }
  }
  return undefined;
}

export function assertRealSkillFolders(root: string): void {
  const problem = linkedSkillFolder(root);
  if (problem !== undefined) {
    throw new OakSkillsError(problem, {
      exitCode: ExitCode.Configuration,
      hint: LINKED_FOLDER_HINT,
    });
  }
}

function isRealFolder(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

export function readSkillFolders(root: string): SkillFolders {
  const top = (dir: string) =>
    existsSync(join(root, dir)) ? readdirSync(join(root, dir)).sort() : [];
  const skillEntries = top(SKILLS_DIR);
  const linkEntries = top(LINKS_DIR);
  const listed = new Map<string, { files: string[]; others: string[] }>();
  for (const entry of skillEntries) {
    const dir = join(root, SKILLS_DIR, entry);
    if (isRealFolder(dir)) {
      const { files, others } = listFolder(dir);
      listed.set(entry, { files, others });
    }
  }
  const ignored = ignoredByGit(root, [
    ...skillEntries.map((entry) => `${SKILLS_DIR}/${entry}`),
    ...linkEntries.map((entry) => `${LINKS_DIR}/${entry}`),
    ...[...listed].flatMap(([name, { files, others }]) =>
      [...files, ...others].map((path) => `${SKILLS_DIR}/${name}/${path}`),
    ),
  ]);
  return {
    skillEntries: skillEntries.filter((entry) => !ignored.has(`${SKILLS_DIR}/${entry}`)),
    linkEntries: linkEntries.filter((entry) => !ignored.has(`${LINKS_DIR}/${entry}`)),
    read: (name) => {
      const contents = listed.get(name);
      if (contents === undefined) return undefined;
      return folderState(join(root, SKILLS_DIR, name), contents, (path) =>
        ignored.has(`${SKILLS_DIR}/${name}/${path}`),
      );
    },
  };
}

function folderState(
  dir: string,
  { files, others }: { files: string[]; others: string[] },
  isIgnored: (path: string) => boolean,
): FolderState {
  return {
    files: Object.fromEntries(
      files.filter((file) => !isIgnored(file)).map((file) => [file, hashFile(join(dir, file))]),
    ),
    others: others.filter((path) => !isIgnored(path)),
    ignored: [...files, ...others].filter(isIgnored).sort(),
  };
}

export function readDraft(root: string, dir: string): FolderState {
  const contents = listFolder(dir);
  const fromRoot = (path: string) => relative(root, join(dir, path));
  const ignored = ignoredByGit(root, [...contents.files, ...contents.others].map(fromRoot));
  return folderState(dir, contents, (path) => ignored.has(fromRoot(path)));
}
