import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PACKAGE_DIR } from './catalogue.ts';
import { OakSkillsError } from './errors.ts';
import { ExitCode } from './exit-codes.ts';
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

const GROUP_SNIPPET = `    groups:
      oak-agent-skills:
        patterns:
          - '${PACKAGE_NAME}'`;

function dependabotAdvice(text: string): string[] {
  const settings = readDependabot(text);
  const advice: string[] = [];
  if (!settings.hasGroup) {
    advice.push(
      `.github/dependabot.yml already exists. In its npm update, give the skills package a group of its own, listed before any other group, and check daily:\n${GROUP_SNIPPET}`,
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
  options: { bundle?: string } = {},
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

  let config: OakSkillsConfig;
  let addConfig: OakSkillsConfig | undefined;
  if (packageJson.oakSkills === undefined) {
    config = { profiles: ['base'], bundle: options.bundle, include: [], exclude: [] };
    addConfig = config;
  } else {
    config = readOakSkillsConfig(packageJson);
    if (options.bundle !== undefined && options.bundle !== config.bundle) {
      warnings.push(
        `package.json already has oakSkills settings, so init left them alone, including the bundle${config.bundle === undefined ? '' : ` "${config.bundle}"`}. Change oakSkills.bundle by hand if you need to.`,
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
  const checklist: ChecklistItem[] = [
    {
      done: false,
      text: 'The oak-skills GitHub App is installed on this repository, so the sync workflow can push.',
    },
    {
      done: false,
      text: 'The organisation Dependabot secrets OAK_SKILLS_APP_CLIENT_ID and OAK_SKILLS_APP_KEY are available to this repository.',
    },
    {
      done: typeof packageManager === 'string' && packageManager.startsWith('pnpm@'),
      text: 'package.json has a packageManager field naming pnpm, which the workflows use to install the right version.',
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
