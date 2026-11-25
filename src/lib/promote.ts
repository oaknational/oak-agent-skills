import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative } from 'node:path';
import { PACKAGE_DIR, readCatalogue } from './catalogue.ts';
import { OakSkillsError } from './errors.ts';
import { listFolder } from './files.ts';
import { ExitCode } from './exit-codes.ts';
import { hashFolder } from './hash.ts';
import { runGit } from './git.ts';
import { CENTRAL_REPO, type GitHub } from './github.ts';
import { LINKS_DIR, readManifest, SKILLS_DIR } from './manifest.ts';
import { readOakSkillsConfig } from './profiles.ts';
import type { Prompt } from './prompt.ts';
import { findRepositoryRoot, readRootPackageJson } from './root.ts';
import { computeStatus } from './status.ts';
import { applySync, planSync } from './sync.ts';
import { CODEOWNERS_PATH, MAINTAINERS } from './validate/codeowners.ts';
import { BUNDLE_CODE } from './validate/central-repo.ts';

export type Bump = 'patch' | 'minor' | 'major';
export const BUMPS: readonly Bump[] = ['patch', 'minor', 'major'];
// Conventional Commits headers, checked by commitlint in the central repository, stay under 100.
const MAX_TITLE = 100;

export const BUMP_RULES = `Which version bump does this change need?
  patch  Wording changes that don't change when the skill fires
  minor  A new skill, or a change to when a repository's own skill fires
  major  A shared skill removed or renamed, or a change to what its description fires on
Until version 1.0.0, a major change is recorded as minor, but its title still marks it as breaking.`;

export interface PromoteOptions {
  name: string;
  isNew: boolean;
  bundle: string | undefined;
  bump: Bump | undefined;
  message: string | undefined;
  dryRun: boolean;
}

export interface PromoteContext {
  cwd: string;
  github: GitHub;
  prompt: Prompt | undefined;
  packageDir?: string;
  now?: Date;
  log: (text: string) => void;
}

export interface PromoteResult {
  title: string;
  bump: Bump;
  // The diff, or for a new skill the files proposed.
  change: string;
  url: string | undefined;
  conflicted: boolean;
  newBundle: string | undefined;
}

const fail = (message: string, hint?: string) =>
  new OakSkillsError(message, hint === undefined ? {} : { hint });

function today(now: Date): string {
  return now.toISOString().slice(0, 10);
}

// Sets metadata.updated in a SKILL.md, adding it if the frontmatter has none.
export function setUpdatedDate(text: string, date: string): string {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (match === null) return text;
  const frontmatter = match[1] ?? '';
  let updated: string;
  if (/^\s+updated:.*$/m.test(frontmatter)) {
    updated = frontmatter.replace(/^(\s+)updated:.*$/m, `$1updated: '${date}'`);
  } else if (/^metadata:\s*$/m.test(frontmatter)) {
    updated = frontmatter.replace(/^metadata:\s*$/m, `metadata:\n  updated: '${date}'`);
  } else {
    updated = `${frontmatter}\nmetadata:\n  updated: '${date}'`;
  }
  // A function, so "$" patterns in the skill's text stay as written.
  return text.replace(frontmatter, () => updated);
}

export function pullRequestTitle(name: string, bump: Bump, reason: string): string {
  const prefix =
    bump === 'patch' ? `fix(${name})` : bump === 'minor' ? `feat(${name})` : `feat(${name})!`;
  const subject = reason.trim().replace(/\.$/, '');
  return `${prefix}: ${subject.charAt(0).toLowerCase()}${subject.slice(1)}`;
}

// Fills in what promote knows, leaving the template's checklist for the developer.
export function fillTemplate(
  template: string,
  fields: { reason: string; skillPath: string; origin: string; note: string | undefined },
): string {
  // Keeps the captured heading and puts the value after it. A function, so "$" patterns in the
  // developer's text stay as written.
  const replace = (text: string, pattern: RegExp, value: string) =>
    text.replace(pattern, (_match, heading: string) => `${heading}${value}`);
  let body = template;
  body = replace(
    body,
    /(## What changed and why\s*\n\s*\n)<!--[\s\S]*?-->/,
    `${fields.note === undefined ? '' : `${fields.note}\n\n`}${fields.reason}`,
  );
  body = replace(body, /(## Skills affected\s*\n\s*\n)<!--[\s\S]*?-->/, fields.skillPath);
  body = replace(body, /^(Originating-Repo:).*$/m, ` ${fields.origin}`);
  if (!body.includes(`Originating-Repo: ${fields.origin}`)) {
    body = `${fields.note === undefined ? '' : `${fields.note}\n\n`}${fields.reason}\n\nSkill: ${fields.skillPath}\nOriginating-Repo: ${fields.origin}\n\n${template}`;
  }
  return body;
}

// The repository this change comes from, as owner/name when its remote is on GitHub.
export function originatingRepo(root: string): string {
  try {
    const url = runGit(['remote', 'get-url', 'origin'], root);
    const match = /github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/.exec(url);
    if (match?.[1] !== undefined) return match[1];
  } catch {
    // No remote: fall back to the folder name.
  }
  return basename(root);
}

function diffNoIndex(cwd: string, from: string, to: string): string {
  const result = spawnSync('git', ['diff', '--no-index', '--no-color', '--', from, to], {
    cwd,
    encoding: 'utf8',
  });
  // git diff --no-index exits 1 when the files differ.
  if (result.status !== 0 && result.status !== 1) {
    throw fail(`git diff failed: ${result.stderr.trim()}`);
  }
  return result.stdout;
}

function isRealFolder(path: string): boolean {
  try {
    return lstatSync(path).isDirectory();
  } catch {
    return false;
  }
}

async function askReason(ctx: PromoteContext, options: PromoteOptions): Promise<string> {
  let reason = options.message;
  if (reason === undefined && ctx.prompt !== undefined) {
    reason = await ctx.prompt('In a sentence, what does this change and why? ');
  }
  if (reason === undefined || reason.trim() === '') {
    throw new OakSkillsError('promote needs a reason for the change.', {
      exitCode: ExitCode.Usage,
      hint: 'Pass it with --message "<reason>".',
    });
  }
  return reason.trim();
}

async function askBump(
  ctx: PromoteContext,
  options: PromoteOptions,
  fallback: Bump,
): Promise<Bump> {
  if (options.bump !== undefined) return options.bump;
  if (ctx.prompt === undefined) {
    ctx.log(`Using a ${fallback} version bump. Pass --bump to choose another.`);
    return fallback;
  }
  const answer = (await ctx.prompt(`${BUMP_RULES}\nBump [${fallback}]: `)).toLowerCase();
  if (answer === '') return fallback;
  if (!(BUMPS as readonly string[]).includes(answer)) {
    throw new OakSkillsError(`"${answer}" isn't a version bump. Choose patch, minor or major.`, {
      exitCode: ExitCode.Usage,
    });
  }
  return answer as Bump;
}

interface Located {
  root: string;
  version: string;
  // The skill's folder in the central repository.
  source: string;
  // Folders in this repository holding the change.
  localFolders: string[];
  change: string;
  newBundle: string | undefined;
}

function locateEdit(root: string, packageDir: string, name: string): Located {
  const status = computeStatus(root, packageDir);
  if (status.configProblems.length > 0) {
    throw new OakSkillsError(`oakSkills has a problem: ${status.configProblems.join(' ')}`, {
      exitCode: ExitCode.Configuration,
    });
  }
  if (status.outOfDate.length > 0) {
    throw fail(
      `The skills are out of date, so promote can't tell your edit apart from the update: ${status.outOfDate.join(' ')}`,
      'Promote from the version the skills were synced from: check out the previous lockfile and reinstall, promote, then update. Syncing now would replace your edit.',
    );
  }
  if (status.unmanaged.length > 0) {
    throw fail(
      `Something oak-skills didn't write is in the skill folders: ${status.unmanaged.join(', ')}.`,
      'Propose a draft skill with "oak-skills promote --new <name>", or remove it, then promote your edit.',
    );
  }
  const manifest = readManifest(root);
  // Only the manifest's own entries: a name such as constructor would find an inherited one.
  const skill =
    manifest !== undefined && Object.hasOwn(manifest.skills, name)
      ? manifest.skills[name]
      : undefined;
  if (manifest === undefined || skill === undefined) {
    throw fail(
      `${name} isn't one of this repository's synced skills.`,
      'To propose a skill drafted here, use "oak-skills promote --new".',
    );
  }
  const edited = status.edited.filter((entry) => entry.startsWith(`${SKILLS_DIR}/${name}/`));
  if (edited.length === 0) {
    throw fail(
      `${name} hasn't been edited: it matches the synced copy, so there's nothing to promote.`,
    );
  }
  const installed = join(packageDir, skill.source);
  const change = diffNoIndex(root, relative(root, installed) || '.', `${SKILLS_DIR}/${name}`);
  return {
    root,
    version: manifest.package.version,
    source: skill.source,
    localFolders: [join(root, SKILLS_DIR, name)],
    change,
    newBundle: undefined,
  };
}

function bundleFor(
  packageDir: string,
  configured: string | undefined,
  requested: string | undefined,
) {
  if (configured !== undefined) {
    if (requested !== undefined && requested !== configured) {
      throw new OakSkillsError(
        `oakSkills already names the bundle "${configured}", so --bundle "${requested}" doesn't apply.`,
        { exitCode: ExitCode.Usage, hint: 'Leave out --bundle.' },
      );
    }
    return { code: configured, isNew: false };
  }
  if (requested === undefined) {
    throw fail(
      "promote --new proposes a skill for this repository's bundle, but oakSkills names no bundle.",
      'For the first skill of a new bundle, pass --bundle with the repository code the skills maintainers gave you. Otherwise set oakSkills.bundle in package.json.',
    );
  }
  if (!BUNDLE_CODE.test(requested) || requested === 'oak') {
    throw new OakSkillsError(
      `--bundle "${requested}" isn't a repository code. Codes are two to four lowercase letters, such as "owa", and "oak" is reserved.`,
      { exitCode: ExitCode.Usage },
    );
  }
  if (readCatalogue(packageDir).bundles.has(requested)) {
    throw fail(
      `The installed package already has the "${requested}" bundle.`,
      `Set oakSkills.bundle to "${requested}" in package.json and run "oak-skills sync", then run promote --new without --bundle.`,
    );
  }
  return { code: requested, isNew: true };
}

function locateDraft(
  root: string,
  packageDir: string,
  name: string,
  requestedBundle: string | undefined,
): Located {
  const config = readOakSkillsConfig(readRootPackageJson(root));
  const bundle = bundleFor(packageDir, config.bundle, requestedBundle);
  if (!name.startsWith(`${bundle.code}-`)) {
    throw fail(
      `${name} must start with "${bundle.code}-", this repository's code, to join its bundle.`,
      `Rename the folder and the name in its SKILL.md, for example to ${bundle.code}-${name.replace(/^[a-z0-9]+-/, '')}.`,
    );
  }
  const synced = readManifest(root)?.skills;
  if (synced !== undefined && Object.hasOwn(synced, name)) {
    throw fail(
      `${name} is already a synced skill. To change it, edit it and run "oak-skills promote ${name}".`,
    );
  }
  const folders = [join(root, SKILLS_DIR, name), join(root, LINKS_DIR, name)].filter(isRealFolder);
  const draft = folders[0];
  if (draft === undefined) {
    throw fail(`There's no draft skill at ${SKILLS_DIR}/${name}/ or ${LINKS_DIR}/${name}/.`);
  }
  if (!existsSync(join(draft, 'SKILL.md')))
    throw fail(`The draft at ${relative(root, draft)} has no SKILL.md.`);
  const [first, second] = folders;
  if (
    first !== undefined &&
    second !== undefined &&
    JSON.stringify(hashFolder(first)) !== JSON.stringify(hashFolder(second))
  ) {
    throw fail(
      `There are different drafts of ${name} in ${SKILLS_DIR}/ and ${LINKS_DIR}/, and promote proposes only one.`,
      `Keep the one you want to propose, delete the other, then run promote again.`,
    );
  }
  const status = computeStatus(root, packageDir);
  if (status.configProblems.length > 0 || status.outOfDate.length > 0) {
    throw fail(
      'The synced skills need attention before promoting a new one.',
      'Run "oak-skills check" to see what, and fix it first.',
    );
  }
  const files = listFolder(draft)
    .files.map((file) => `  ${relative(root, join(draft, file))}`)
    .join('\n');
  return {
    root,
    version: status.toolVersion,
    source: `skills/repos/${bundle.code}/${name}`,
    localFolders: folders,
    change: `New skill files:\n${files}`,
    newBundle: bundle.isNew ? bundle.code : undefined,
  };
}

function git(cwd: string, ...args: string[]): string {
  return runGit(args, cwd);
}

function addBundleOwners(clone: string, code: string): void {
  const file = join(clone, CODEOWNERS_PATH);
  const existing = existsSync(file) ? readFileSync(file, 'utf8') : '';
  const separator = existing === '' || existing.endsWith('\n') ? '' : '\n';
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${existing}${separator}/skills/repos/${code}/ ${MAINTAINERS}\n`);
}

// Takes the diff against the skill at the release tag the copy came from, then applies it to a
// branch from main with a three-way merge, so it still applies if the skill has changed since.
function applyEdit(clone: string, work: string, located: Located): boolean {
  const tag = `v${located.version}`;
  try {
    git(clone, 'rev-parse', '--verify', '--quiet', `refs/tags/${tag}`);
  } catch {
    throw fail(
      `The central repository has no release tag ${tag}, so promote can't find the version your copy came from.`,
    );
  }
  const worktree = join(work, 'at-tag');
  const patchFile = join(work, 'change.patch');
  git(clone, 'worktree', 'add', '--quiet', '--detach', worktree, tag);
  try {
    rmSync(join(worktree, located.source), { recursive: true, force: true });
    cpSync(located.localFolders[0] ?? '', join(worktree, located.source), { recursive: true });
    git(worktree, 'add', '--all', '--', located.source);
    // git writes the file itself: a patch needs its trailing whitespace, which runGit trims.
    git(worktree, 'diff', '--cached', '--binary', `--output=${patchFile}`);
  } finally {
    git(clone, 'worktree', 'remove', '--force', worktree);
  }
  const applied = spawnSync('git', ['apply', '--3way', '--index', patchFile], {
    cwd: clone,
    encoding: 'utf8',
  });
  if (applied.status === 0) return false;
  const conflicted = git(clone, 'diff', '--name-only', '--diff-filter=U');
  if (conflicted === '') {
    throw fail(
      `The change couldn't be applied to the central repository: ${applied.stderr.trim()}`,
    );
  }
  git(clone, 'add', '--all', '--', located.source);
  return true;
}

export async function promote(
  ctx: PromoteContext,
  options: PromoteOptions,
): Promise<PromoteResult> {
  const packageDir = ctx.packageDir ?? PACKAGE_DIR;
  runGit(['--version'], ctx.cwd);
  const root = findRepositoryRoot(ctx.cwd);
  const located = options.isNew
    ? locateDraft(root, packageDir, options.name, options.bundle)
    : locateEdit(root, packageDir, options.name);

  if (!options.dryRun) {
    const problem = ctx.github.problem();
    if (problem !== undefined) throw fail(problem);
    if (!ctx.github.canPush(CENTRAL_REPO)) {
      throw fail(
        `You don't have write access to ${CENTRAL_REPO}, so promote can't open a pull request there.`,
        'Ask the skills maintainers for access, or raise a skill-feedback issue describing the change.',
      );
    }
  }

  const reason = await askReason(ctx, options);
  const bump = await askBump(ctx, options, options.isNew ? 'minor' : 'patch');
  const title = pullRequestTitle(options.name, bump, reason);
  if (title.length > MAX_TITLE) {
    throw new OakSkillsError(
      `The pull request title would be ${String(title.length)} characters, over ${String(MAX_TITLE)}.`,
      {
        exitCode: ExitCode.Usage,
        hint: 'Give a shorter reason with --message.',
      },
    );
  }
  if (options.dryRun) {
    return {
      title,
      bump,
      change: located.change,
      url: undefined,
      conflicted: false,
      newBundle: located.newBundle,
    };
  }

  const template = ctx.github.pullRequestTemplate(CENTRAL_REPO);
  const work = mkdtempSync(join(tmpdir(), 'oak-skills-promote-'));
  try {
    const clone = join(work, 'oak-agent-skills');
    ctx.log(`Cloning ${CENTRAL_REPO}...`);
    ctx.github.clone(CENTRAL_REPO, clone);
    const date = today(ctx.now ?? new Date());
    const branch = `promote/${options.name}-${String((ctx.now ?? new Date()).getTime())}`;
    git(clone, 'switch', '--quiet', '--create', branch);

    let conflicted = false;
    if (options.isNew) {
      if (existsSync(join(clone, located.source))) {
        throw fail(`The central repository already has ${located.source}.`);
      }
      if (located.newBundle !== undefined) addBundleOwners(clone, located.newBundle);
      cpSync(located.localFolders[0] ?? '', join(clone, located.source), { recursive: true });
    } else {
      conflicted = applyEdit(clone, work, located);
    }

    const skillFile = join(clone, located.source, 'SKILL.md');
    writeFileSync(skillFile, setUpdatedDate(readFileSync(skillFile, 'utf8'), date));
    const changesetBump = bump === 'major' && located.version.startsWith('0.') ? 'minor' : bump;
    writeFileSync(
      join(
        clone,
        '.changeset',
        `promote-${options.name}-${String((ctx.now ?? new Date()).getTime())}.md`,
      ),
      `---\n'@oaknational/oak-agent-skills': ${changesetBump}\n---\n\n${reason.replace(/\.?$/, '.')}\n`,
    );
    const origin = originatingRepo(root);
    git(clone, 'add', '--all');
    git(clone, 'commit', '--quiet', '--message', title, '--trailer', `Originating-Repo: ${origin}`);
    const note = conflicted
      ? "> [!WARNING]\n> This change didn't apply cleanly to `main`, because the skill has changed since the version it was edited from. The conflict markers are committed; resolve them before marking this ready for review."
      : located.newBundle !== undefined
        ? `> [!NOTE]\n> The first skill of a new bundle, \`${located.newBundle}\`. promote added a CODEOWNERS line for \`skills/repos/${located.newBundle}/\` naming the skills maintainers: add the repository's own team to it. Check the skill's frontmatter, and run \`pnpm readme:skills\`.`
        : options.isNew
          ? '> [!NOTE]\n> A new skill. Check its frontmatter, and run `pnpm readme:skills`.'
          : undefined;
    const body = fillTemplate(template, { reason, skillPath: located.source, origin, note });
    git(clone, 'push', '--quiet', '--set-upstream', 'origin', branch);
    let url: string;
    try {
      url = ctx.github.createPullRequest({
        repo: CENTRAL_REPO,
        cwd: clone,
        base: 'main',
        head: branch,
        title,
        body,
        draft: conflicted,
      });
    } catch (error) {
      let removed = true;
      try {
        git(clone, 'push', '--quiet', 'origin', '--delete', branch);
      } catch {
        removed = false;
      }
      throw fail(
        `promote pushed ${branch}, but couldn't open the pull request: ${(error as Error).message}`,
        removed
          ? 'It deleted the branch again, and changed nothing here. Run promote again when GitHub is reachable.'
          : `Delete the branch ${branch} in ${CENTRAL_REPO}, then run promote again. Nothing here changed.`,
      );
    }

    // Restore this repository, so its own pull request passes "oak-skills check". The change
    // arrives with the next release.
    if (options.isNew) {
      for (const folder of located.localFolders) rmSync(folder, { recursive: true, force: true });
    } else {
      applySync(planSync(root, packageDir));
    }
    return { title, bump, change: located.change, url, conflicted, newBundle: located.newBundle };
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}
