import { OakSkillsError } from '../errors.ts';
import { runGit } from '../git.ts';
import { splitSkillFile } from '../skill-file.ts';
import type { DevDependencies } from './dev-dependencies.ts';
import type { Problem } from './problem.ts';
import type { CheckedSkill } from './skill-checks.ts';

interface Comparison {
  // The commit to compare with, and how to describe it in a message.
  ref: string;
  description: string;
  changedPaths: string[];
}

function tryGit(args: string[], root: string): string | undefined {
  try {
    return runGit(args, root);
  } catch {
    return undefined;
  }
}

// On a pull request, GitHub sets GITHUB_BASE_REF, so compare with where the branch left it.
// Everywhere else, compare the working tree with HEAD, which is what a commit would change.
function findComparison(root: string, env: NodeJS.ProcessEnv): Comparison | undefined {
  if (tryGit(['rev-parse', '--verify', '--quiet', 'HEAD'], root) === undefined) return undefined;

  const baseBranch = env.GITHUB_BASE_REF;
  if (baseBranch !== undefined && baseBranch !== '') {
    const mergeBase =
      tryGit(['merge-base', 'HEAD', `origin/${baseBranch}`], root) ??
      tryGit(['merge-base', 'HEAD', baseBranch], root);
    if (mergeBase === undefined) {
      throw new OakSkillsError(`Can't find where this branch left ${baseBranch}.`, {
        hint: 'Check out the full history, for example with fetch-depth: 0 in actions/checkout.',
      });
    }
    const changed = runGit(['diff', '--name-only', '-z', mergeBase, 'HEAD', '--', 'skills'], root);
    return {
      ref: mergeBase,
      description: baseBranch,
      changedPaths: changed.split('\0').filter((path) => path !== ''),
    };
  }

  const status = runGit(
    ['status', '--porcelain=v1', '-z', '--untracked-files=all', '--', 'skills'],
    root,
  );
  // Each entry is "XY path". A rename is followed by its original path as a separate entry,
  // with no status, and every path starts with skills/ because of the -- skills filter.
  const changedPaths = status
    .split('\0')
    .filter((entry) => entry !== '')
    .map((entry) => (entry.startsWith('skills/') ? entry : entry.slice(3)));
  return { ref: 'HEAD', description: 'the last commit', changedPaths };
}

function updatedAt(
  root: string,
  ref: string,
  skillPath: string,
  deps: Pick<DevDependencies, 'yaml'>,
): string | undefined {
  const text = tryGit(['show', `${ref}:${skillPath}/SKILL.md`], root);
  const frontmatter = text === undefined ? undefined : splitSkillFile(text)?.frontmatter;
  if (frontmatter === undefined) return undefined;
  try {
    const parsed = deps.yaml.parse(frontmatter) as { metadata?: { updated?: unknown } } | null;
    const updated = parsed?.metadata?.updated;
    return typeof updated === 'string' ? updated : undefined;
  } catch {
    return undefined;
  }
}

export function checkUpdatedDates(
  root: string,
  skills: readonly CheckedSkill[],
  deps: Pick<DevDependencies, 'yaml'>,
  env: NodeJS.ProcessEnv = process.env,
  now: Date = new Date(),
): Problem[] {
  const comparison = findComparison(root, env);
  // A second change on the same day can't change the date again, and needn't: it's already
  // right. Accept the local date as well as UTC, so a change made just after midnight passes.
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  const today = new Set([now.toISOString().slice(0, 10), local.toISOString().slice(0, 10)]);
  if (comparison === undefined) return [];
  const problems: Problem[] = [];
  for (const { location, frontmatter } of skills) {
    if (frontmatter === undefined) continue;
    const changed = comparison.changedPaths.some((path) => path.startsWith(`${location.path}/`));
    if (!changed) continue;
    // A skill that didn't exist before can have any date.
    const before = updatedAt(root, comparison.ref, location.path, deps);
    const { updated } = frontmatter.metadata;
    if (before !== undefined && before === updated && !today.has(updated)) {
      problems.push({
        file: `${location.path}/SKILL.md`,
        message: `has changed since ${comparison.description}, but metadata.updated is still ${before}. Set it to today's date.`,
      });
    }
  }
  return problems;
}
