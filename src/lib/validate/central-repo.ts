import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join } from 'node:path';
import { OakSkillsError } from '../errors.ts';
import { runGit } from '../git.ts';
import type { Problem } from './problem.ts';

export const PACKAGE_NAME = '@oaknational/oak-agent-skills';

export interface SkillLocation {
  // The folder name, which must also be the skill's name.
  name: string;
  // The repository code for a skill in skills/repos/<code>/, or undefined for a shared skill.
  bundle: string | undefined;
  // Relative to the repository root, such as skills/central/oak-security-review.
  path: string;
}

// A repository's code is the name of its folder under skills/repos/: two to four lowercase letters.
export const BUNDLE_CODE = /^[a-z]{2,4}$/;

export function findCentralRoot(cwd: string): string {
  const notCentral = new OakSkillsError(
    'oak-skills validate only runs in the central oak-agent-skills repository.',
    { hint: 'Consuming repositories run "oak-skills check" instead.' },
  );
  let root: string;
  try {
    root = runGit(['rev-parse', '--show-toplevel'], cwd);
  } catch {
    throw notCentral;
  }
  const packageJson = join(root, 'package.json');
  const name = existsSync(packageJson)
    ? (JSON.parse(readFileSync(packageJson, 'utf8')) as { name?: unknown }).name
    : undefined;
  if (name !== PACKAGE_NAME) throw notCentral;
  return root;
}

// readdir order differs between file systems, so sort by code point for repeatable output.
function sortedEntries(folder: string): Dirent[] {
  return readdirSync(folder, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1));
}

function subfolders(root: string, relative: string, problems: Problem[]): string[] {
  const names: string[] = [];
  for (const entry of sortedEntries(join(root, relative))) {
    if (entry.isDirectory()) names.push(entry.name);
    else problems.push({ file: `${relative}/${entry.name}`, message: 'should be a skill folder' });
  }
  return names;
}

export function findSkills(root: string): { skills: SkillLocation[]; problems: Problem[] } {
  const skills: SkillLocation[] = [];
  const problems: Problem[] = [];
  if (!existsSync(join(root, 'skills'))) return { skills, problems };

  for (const entry of sortedEntries(join(root, 'skills'))) {
    const known =
      (entry.isDirectory() && (entry.name === 'central' || entry.name === 'repos')) ||
      (entry.isFile() && entry.name === 'profiles.json');
    if (!known) {
      problems.push({
        file: `skills/${entry.name}`,
        message: "isn't expected here. skills/ holds only central/, repos/ and profiles.json.",
      });
    }
  }

  if (existsSync(join(root, 'skills/central'))) {
    for (const name of subfolders(root, 'skills/central', problems)) {
      skills.push({ name, bundle: undefined, path: `skills/central/${name}` });
    }
  }
  if (existsSync(join(root, 'skills/repos'))) {
    for (const code of subfolders(root, 'skills/repos', problems)) {
      if (!BUNDLE_CODE.test(code)) {
        problems.push({
          file: `skills/repos/${code}`,
          message: 'is not a valid repository code. Codes are two to four lowercase letters.',
        });
        continue;
      }
      for (const name of subfolders(root, `skills/repos/${code}`, problems)) {
        skills.push({ name, bundle: code, path: `skills/repos/${code}/${name}` });
      }
    }
  }
  return { skills, problems };
}
