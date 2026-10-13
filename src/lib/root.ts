import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { OakSkillsError } from './errors.ts';
import { ExitCode } from './exit-codes.ts';
import { runGit } from './git.ts';

// Every command acts on the repository root, whichever folder it's run from, so a workspace
// package never gets its own skill folders.
export function findRepositoryRoot(cwd: string): string {
  try {
    return runGit(['rev-parse', '--show-toplevel'], cwd);
  } catch (error) {
    throw new OakSkillsError(
      `oak-skills must run inside a git repository: ${(error as Error).message}`,
      {
        exitCode: ExitCode.Configuration,
      },
    );
  }
}

export function readRootPackageJson(root: string): Record<string, unknown> {
  const file = join(root, 'package.json');
  if (!existsSync(file)) {
    throw new OakSkillsError(
      "The repository root has no package.json, so oak-skills can't read its settings.",
      {
        exitCode: ExitCode.Configuration,
      },
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new OakSkillsError(`package.json isn't valid JSON: ${(error as Error).message}`, {
      exitCode: ExitCode.Configuration,
    });
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new OakSkillsError('package.json must hold a JSON object.', {
      exitCode: ExitCode.Configuration,
    });
  }
  return parsed as Record<string, unknown>;
}

// pnpm 10 and later also use pnpm-workspace.yaml for settings alone, so the file only makes the
// repository a workspace when it lists packages. This reads just the top-level packages key,
// in block or flow style, so the tool needs no YAML parser.
export function listsWorkspacePackages(yaml: string): boolean {
  const lines = yaml.split(/\r?\n/).map((line) => line.replace(/\s+#.*$/, '').replace(/^#.*$/, ''));
  const start = lines.findIndex((line) => /^packages\s*:/.test(line));
  if (start === -1) return false;

  const inline = (lines[start] ?? '').replace(/^packages\s*:/, '').trim();
  if (inline !== '') {
    // Flow style, such as packages: ['apps/*'], or an empty list.
    return /^\[\s*\S/.test(inline) && !/^\[\s*\]$/.test(inline);
  }
  for (const line of lines.slice(start + 1)) {
    if (line.trim() === '') continue;
    if (/^\S/.test(line) && !line.startsWith('-')) return false;
    if (/^\s*-\s*\S/.test(line)) return true;
  }
  return false;
}

export function isPnpmWorkspace(root: string): boolean {
  const file = join(root, 'pnpm-workspace.yaml');
  return existsSync(file) && listsWorkspacePackages(readFileSync(file, 'utf8'));
}
