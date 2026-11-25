import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { PACKAGE_DIR, readCatalogue } from './catalogue.ts';
import { runGit } from './git.ts';
import { LINKS_DIR, SKILLS_DIR } from './manifest.ts';
import { OakSkillsError } from './errors.ts';
import { ExitCode } from './exit-codes.ts';
import { readPackageInfo } from './package-info.ts';
import { readOakSkillsConfig, type OakSkillsConfig } from './profiles.ts';
import { findRepositoryRoot, isPnpmWorkspace, readRootPackageJson } from './root.ts';
import { PACKAGE_NAME, readDependabot, readReleaseAge } from './settings-files.ts';
import { BUNDLE_CODE } from './validate/central-repo.ts';
import { applySync, planSync, type SyncPlan } from './sync.ts';

// What init writes from the package's templates/ folder, if the repository doesn't have it yet.
export const TEMPLATE_FILES = [
  { template: 'AGENTS.md', path: 'AGENTS.md' },
  { template: 'CLAUDE.md', path: 'CLAUDE.md' },
  { template: 'workflows/oak-skills-check.yml', path: '.github/workflows/oak-skills-check.yml' },
  { template: 'workflows/oak-skills-sync.yml', path: '.github/workflows/oak-skills-sync.yml' },
  { template: 'dependabot-group.yml', path: '.github/dependabot.yml' },
] as const;

export interface FileStep {
  path: string;
  template: string;
  // Exists already, so init leaves it alone.
  exists: boolean;
}

export interface ChecklistItem {
  done: boolean;
  text: string;
}

export interface InitPlan {
  root: string;
  packageDir: string;
  files: FileStep[];
  config: OakSkillsConfig;
  // The settings init adds to package.json, or undefined when it already has them.
  addConfig: OakSkillsConfig | undefined;
  // Changes init can't make safely to files that already exist, for the developer to make.
  toDo: string[];
  warnings: string[];
  checklist: ChecklistItem[];
  sync: SyncPlan;
}

const PRETTIER_CONFIGS = [
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.json5',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  '.prettierrc.toml',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.mjs',
  '.prettierrc.ts',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'prettier.config.ts',
];

function prettierAdvice(root: string, packageJson: Record<string, unknown>): string[] {
  const configured =
    packageJson.prettier !== undefined ||
    PRETTIER_CONFIGS.some((file) => existsSync(join(root, file)));
  if (!configured) return [];
  const ignoreFile = join(root, '.prettierignore');
  const ignored =
    existsSync(ignoreFile) &&
    readFileSync(ignoreFile, 'utf8')
      .split(/\r?\n/)
      .some((line) => /^\/?\.agents(?:\/(?:skills\/?)?)?(?:\*\*)?$/.test(line.trim()));
  return ignored
    ? []
    : [
        "This repository uses Prettier. If your Prettier check covers Markdown or JSON, add .agents/skills/ to .prettierignore, or Prettier rewrites the synced skills and check reports them as edited. Prettier doesn't follow the links in .claude/skills/, so that one line is enough.",
      ];
}

function gitIgnores(root: string, path: string): boolean {
  try {
    runGit(['check-ignore', '--quiet', '--', path], root);
    return true;
  } catch {
    return false;
  }
}

function ignoredSkillFolderAdvice(root: string): string[] {
  return [SKILLS_DIR, LINKS_DIR]
    .filter((dir) => gitIgnores(root, `${dir}/a-skill`))
    .map(
      (dir) =>
        `git ignores ${dir}/, so what sync writes there won't be committed, and check fails in every fresh clone. Change the rule that ignores it in .gitignore. For example, replace ${dir.split('/')[0] ?? dir}/ with ${dir.split('/')[0] ?? dir}/* and add a line holding !${dir}/.`,
    );
}

const GROUP_SNIPPET = `    groups:
      oak-agent-skills:
        patterns:
          - '${PACKAGE_NAME}'`;

function dependabotAdvice(text: string): string[] {
  const settings = readDependabot(text);
  const advice: string[] = [];
  if (!settings.ownGroupFirst) {
    advice.push(
      `.github/dependabot.yml already exists. In its npm update, give the skills package a group of its own, listed before any other group, and check daily:\n${GROUP_SNIPPET}`,
    );
  }
  if (settings.catchAllGroups.length > 0) {
    const names = settings.catchAllGroups.map((name) => `"${name}"`).join(', ');
    advice.push(
      `.github/dependabot.yml's ${names} ${settings.catchAllGroups.length === 1 ? 'group takes' : 'groups take'} the skills package along with other packages, for version or security updates. Exclude it from each, so its updates always arrive on their own:\n        exclude-patterns:\n          - '${PACKAGE_NAME}'`,
    );
  }
  if (settings.hasCooldown && !settings.cooldownExempt) {
    advice.push(
      `.github/dependabot.yml sets a cooldown, which would hold back every skills release. Exempt the package in each cooldown:\n    cooldown:\n      exclude:\n        - '${PACKAGE_NAME}'`,
    );
  }
  return advice;
}

export function planInit(
  cwd: string,
  options: { bundle?: string; profiles?: string[] } = {},
  packageDir: string = PACKAGE_DIR,
): InitPlan {
  const root = findRepositoryRoot(cwd);
  const packageJson = readRootPackageJson(root);
  const warnings: string[] = [];
  const toDo: string[] = [];

  if (options.bundle !== undefined && !BUNDLE_CODE.test(options.bundle)) {
    throw new OakSkillsError(
      `--bundle "${options.bundle}" isn't a repository code. Codes are two to four lowercase letters, such as "owa".`,
      { exitCode: ExitCode.Configuration },
    );
  }
  const known = readCatalogue(packageDir).profiles;
  const unknown = (options.profiles ?? []).find((profile) => !known.has(profile));
  if (unknown !== undefined) {
    throw new OakSkillsError(
      `--profile "${unknown}" isn't a profile in version ${readPackageInfo(pathToFileURL(join(packageDir, 'package.json'))).version}. The profiles are ${[...known.keys()].map((name) => `"${name}"`).join(', ')}.`,
      { exitCode: ExitCode.Configuration },
    );
  }
  const profiles = [...new Set(['base', ...(options.profiles ?? [])])];

  let config: OakSkillsConfig;
  let addConfig: OakSkillsConfig | undefined;
  if (packageJson.oakSkills === undefined) {
    config = { profiles, bundle: options.bundle, include: [], exclude: [] };
    addConfig = config;
  } else {
    config = readOakSkillsConfig(packageJson);
    if (options.bundle !== undefined && options.bundle !== config.bundle) {
      warnings.push(
        `package.json already has oakSkills settings, so init left them alone, including the bundle${config.bundle === undefined ? '' : ` "${config.bundle}"`}. Change oakSkills.bundle by hand if you need to.`,
      );
    }
    const existing = config.profiles;
    if (
      options.profiles !== undefined &&
      (profiles.length !== existing.length || profiles.some((name) => !existing.includes(name)))
    ) {
      warnings.push(
        `package.json already has oakSkills settings, so init left them alone, including the profiles ${JSON.stringify(existing)}. Change oakSkills.profiles by hand if you need to.`,
      );
    }
  }

  const files: FileStep[] = TEMPLATE_FILES.map(({ template, path }) => ({
    template,
    path,
    exists:
      existsSync(join(root, path)) ||
      (path.endsWith('.yml') && existsSync(join(root, path.replace(/\.yml$/, '.yaml')))),
  }));

  const claude = join(root, 'CLAUDE.md');
  if (
    existsSync(claude) &&
    !readFileSync(claude, 'utf8')
      .split(/\r?\n/)
      .some((line) => line.trim() === '@AGENTS.md')
  ) {
    toDo.push(
      'CLAUDE.md already exists. Add a line holding just @AGENTS.md at its top, so Claude Code reads AGENTS.md.',
    );
  }
  const dependabot = ['.github/dependabot.yml', '.github/dependabot.yaml'].find((path) =>
    existsSync(join(root, path)),
  );
  if (dependabot !== undefined)
    toDo.push(...dependabotAdvice(readFileSync(join(root, dependabot), 'utf8')));

  const workspaceFile = join(root, 'pnpm-workspace.yaml');
  if (existsSync(workspaceFile)) {
    const releaseAge = readReleaseAge(readFileSync(workspaceFile, 'utf8'));
    if (releaseAge.minutes !== undefined && !releaseAge.exempt) {
      toDo.push(
        `pnpm-workspace.yaml holds back new package versions for ${String(releaseAge.minutes)} minutes, which would delay every skills release. Exempt the package:\nminimumReleaseAgeExclude:\n  - '${PACKAGE_NAME}'`,
      );
    }
  }

  toDo.push(...ignoredSkillFolderAdvice(root), ...prettierAdvice(root, packageJson));

  const has = (field: string) => {
    const deps = packageJson[field];
    return typeof deps === 'object' && deps !== null && PACKAGE_NAME in deps;
  };
  if (has('dependencies')) {
    warnings.push(
      `${PACKAGE_NAME} is in dependencies. Move it to devDependencies: it's only needed in development.`,
    );
  } else if (!has('devDependencies')) {
    warnings.push(
      `The root package.json doesn't list ${PACKAGE_NAME}. Add it with: pnpm add -D${isPnpmWorkspace(root) ? ' -w' : ''} ${PACKAGE_NAME}`,
    );
  }

  const packageManager = packageJson.packageManager;
  const engines = packageJson.engines;
  const checklist: ChecklistItem[] = [
    {
      done: false,
      text: 'The Oak Agent Skills GitHub App is installed on this repository, so the sync workflow can push.',
    },
    {
      done: false,
      text: 'The organisation Dependabot secrets OAK_SKILLS_APP_CLIENT_ID and OAK_SKILLS_APP_KEY are available to this repository.',
    },
    {
      done: typeof packageManager === 'string' && packageManager.startsWith('pnpm@'),
      text: 'package.json has a packageManager field naming pnpm, which the workflows use to install the right version.',
    },
    {
      done:
        typeof engines === 'object' &&
        engines !== null &&
        typeof (engines as Record<string, unknown>).node === 'string',
      text: 'package.json has an engines.node field, which the workflows read to set up Node.',
    },
    { done: false, text: '"oak-skills check" is a required status check for pull requests.' },
  ];

  return {
    root,
    packageDir,
    files,
    config,
    addConfig,
    toDo,
    warnings,
    checklist,
    sync: planSync(root, packageDir, config),
  };
}

// Keep package.json's own indentation, so adding oakSkills changes only those lines.
function writePackageJson(root: string, config: OakSkillsConfig): void {
  const file = join(root, 'package.json');
  const text = readFileSync(file, 'utf8');
  const indent = /^\{\r?\n([ \t]+)"/.exec(text)?.[1] ?? '  ';
  const packageJson = JSON.parse(text) as Record<string, unknown>;
  packageJson.oakSkills = {
    profiles: config.profiles,
    ...(config.bundle === undefined ? {} : { bundle: config.bundle }),
    include: config.include,
    exclude: config.exclude,
  };
  writeFileSync(file, `${JSON.stringify(packageJson, null, indent)}\n`);
}

export function applyInit(plan: InitPlan): void {
  for (const file of plan.files.filter((step) => !step.exists)) {
    const target = join(plan.root, file.path);
    mkdirSync(dirname(target), { recursive: true });
    copyFileSync(join(plan.packageDir, 'templates', file.template), target);
  }
  if (plan.addConfig !== undefined) writePackageJson(plan.root, plan.addConfig);
  applySync(plan.sync);
}
