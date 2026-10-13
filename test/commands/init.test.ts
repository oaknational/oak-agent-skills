import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/lib/exit-codes.ts';
import { readManifest } from '../../src/lib/manifest.ts';
import { run } from '../../src/run.ts';
import { capture } from '../helpers/capture.ts';
import { packageWithTemplates, setOakSkills } from '../helpers/consumer.ts';
import { repoRoot } from '../helpers/paths.ts';
import { createTempRepo, type FixtureName, type TempRepo } from '../helpers/temp-repo.ts';
import { removeTree, writeTree } from '../helpers/tree.ts';

const packageDir = packageWithTemplates();
afterAll(() => {
  removeTree(packageDir);
});

const repos: TempRepo[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});

function repoFrom(
  fixture: FixtureName = 'single-package',
  files: Record<string, string> = {},
): TempRepo {
  const repo = createTempRepo(fixture);
  repos.push(repo);
  writeTree(repo.root, files);
  if (Object.keys(files).length > 0) {
    repo.git('add', '--all');
    repo.git('commit', '--quiet', '--message', 'chore: existing files');
  }
  return repo;
}

async function init(cwd: string, ...args: string[]) {
  const captured = capture();
  const code = await run(['init', ...args], captured.output, { cwd, packageDir });
  return { code, out: captured.out(), err: captured.err() };
}

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');
const oakSkillsIn = (root: string): unknown =>
  (JSON.parse(read(root, 'package.json')) as { oakSkills?: unknown }).oakSkills;
const template = (path: string) => readFileSync(join(repoRoot, 'templates', path), 'utf8');

describe('oak-skills init in an empty repository', () => {
  it('creates every file, adds oakSkills with the bundle, and syncs', async () => {
    const { root } = repoFrom();
    const result = await init(root, '--bundle', 'owa');
    expect(result.code).toBe(0);
    expect(result.out).toContain('Created AGENTS.md');
    expect(result.out).toContain('Created .github/workflows/oak-skills-sync.yml');
    expect(result.out).toContain(
      'Added oakSkills to package.json: profiles ["base"], bundle "owa"',
    );
    expect(result.out).toContain(
      'Synced 3 skills from version 1.2.3 into .agents/skills/, with links in .claude/skills/.',
    );
    expect(read(root, 'AGENTS.md')).toBe(template('AGENTS.md'));
    expect(read(root, 'CLAUDE.md')).toBe('@AGENTS.md\n');
    expect(read(root, '.github/workflows/oak-skills-check.yml')).toBe(
      template('workflows/oak-skills-check.yml'),
    );
    expect(read(root, '.github/dependabot.yml')).toBe(template('dependabot-group.yml'));
    expect(JSON.parse(read(root, 'package.json'))).toMatchObject({
      oakSkills: { profiles: ['base'], bundle: 'owa', include: [], exclude: [] },
    });
    expect(readManifest(root)?.config.bundle).toBe('owa');
  });

  it('leaves out the bundle when none is given, and prints the checklist', async () => {
    const { root } = repoFrom();
    const result = await init(root);
    expect(oakSkillsIn(root)).toEqual({
      profiles: ['base'],
      include: [],
      exclude: [],
    });
    expect(result.out).toContain('Checklist:\n- [ ] The oak-skills GitHub App is installed');
    expect(result.out).toContain('- [x] package.json has a packageManager field');
    expect(result.out).not.toContain('To do');
  });

  it('writes nothing on a dry run, but shows the plan', async () => {
    const repo = repoFrom();
    const result = await init(repo.root, '--bundle', 'oc', '--dry-run');
    expect(result.code).toBe(0);
    expect(result.out).toContain('Would create CLAUDE.md');
    expect(result.out).toContain(
      'Would add oakSkills to package.json: profiles ["base"], bundle "oc"',
    );
    expect(result.out).toContain('Would sync 3 skills');
    expect(result.out).toContain('Dry run: nothing was changed.');
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  it('changes nothing when run a second time', async () => {
    const repo = repoFrom();
    await init(repo.root, '--bundle', 'owa');
    repo.git('add', '--all');
    repo.git('commit', '--quiet', '--message', 'chore: init');
    const second = await init(repo.root);
    expect(second.out).toContain('Kept AGENTS.md, which already exists');
    expect(second.out).toContain('The skills are already up to date: 3 from version 1.2.3.');
    expect(repo.git('status', '--porcelain')).toBe('');
  });
});

describe('oak-skills init in a repository with its own files', () => {
  const existing = {
    'AGENTS.md': '# Our own AGENTS.md\n',
    'CLAUDE.md': '# Claude notes\n\nSome notes.\n',
    '.github/dependabot.yml':
      'version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule:\n      interval: weekly\n    cooldown:\n      default-days: 5\n',
  };

  it('never overwrites them, and says what to add instead', async () => {
    const { root } = repoFrom('single-package', existing);
    const result = await init(root);
    expect(result.code).toBe(0);
    for (const [path, contents] of Object.entries(existing)) {
      expect(read(root, path)).toBe(contents);
      expect(result.out).toContain(`Kept ${path}, which already exists`);
    }
    expect(result.out).toContain('Created .github/workflows/oak-skills-check.yml');
    expect(result.out).toContain('To do, because init never changes files you already have:');
    expect(result.out).toContain('- CLAUDE.md already exists. Add a line holding just @AGENTS.md');
    expect(result.out).toContain(
      'give the skills package a group of its own, listed before any other group',
    );
    expect(result.out).toContain('sets a cooldown, which would hold back every skills release');
    expect(result.out).toContain("        - '@oaknational/oak-agent-skills'");
  });

  it('has nothing to add when the files are already right', async () => {
    const { root } = repoFrom('single-package', {
      'CLAUDE.md': '@AGENTS.md\n\nClaude-specific notes.\n',
      '.github/dependabot.yaml':
        "version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    groups:\n      skills:\n        patterns: ['@oaknational/oak-agent-skills']\n    cooldown:\n      default-days: 5\n      exclude: ['@oaknational/*']\n",
    });
    const result = await init(root);
    expect(result.out).not.toContain('To do');
    expect(result.out).toContain('Kept .github/dependabot.yml, which already exists');
    expect(existsSync(join(root, '.github/dependabot.yml'))).toBe(false);
  });

  it('keeps existing oakSkills settings, and warns if --bundle differs', async () => {
    const { root } = repoFrom();
    setOakSkills(root, { profiles: ['base', 'frontend'], bundle: 'oc' });
    const result = await init(root, '--bundle', 'owa');
    expect(oakSkillsIn(root)).toEqual({
      profiles: ['base', 'frontend'],
      bundle: 'oc',
    });
    expect(result.out).not.toContain('Added oakSkills');
    expect(result.err).toContain(
      'package.json already has oakSkills settings, so init left them alone, including the bundle "oc".',
    );
    expect(readManifest(root)?.config.profiles).toEqual(['base', 'frontend']);
  });

  it('warns about --bundle when the existing settings have no bundle', async () => {
    const { root } = repoFrom();
    setOakSkills(root, { profiles: ['base'] });
    expect((await init(root, '--bundle', 'owa')).err).toContain(
      'left them alone, including the bundle.',
    );
  });

  it('keeps tab indentation in package.json', async () => {
    const { root } = repoFrom();
    writeFileSync(
      join(root, 'package.json'),
      '{\n\t"name": "tabs",\n\t"packageManager": "pnpm@11.2.0"\n}\n',
    );
    await init(root);
    expect(read(root, 'package.json')).toBe(
      '{\n\t"name": "tabs",\n\t"packageManager": "pnpm@11.2.0",\n\t"oakSkills": {\n\t\t"profiles": [\n\t\t\t"base"\n\t\t],\n\t\t"include": [],\n\t\t"exclude": []\n\t}\n}\n',
    );
  });
});

describe('oak-skills init in a pnpm workspace', () => {
  it('works at the root when run from a package folder, and suggests -w', async () => {
    const { root } = repoFrom('workspace');
    const result = await init(join(root, 'apps/web'));
    expect(result.code).toBe(0);
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
    expect(existsSync(join(root, 'apps/web/AGENTS.md'))).toBe(false);
    expect(oakSkillsIn(root)).toBeDefined();
    expect(result.err).toContain('Add it with: pnpm add -D -w @oaknational/oak-agent-skills');
  });

  it("doesn't suggest -w when pnpm-workspace.yaml holds only settings", async () => {
    const { root } = repoFrom('settings-only-workspace');
    expect((await init(root)).err).toContain(
      'Add it with: pnpm add -D @oaknational/oak-agent-skills',
    );
  });
});

describe('oak-skills init with a release age', () => {
  it('prints the exemption to add to pnpm-workspace.yaml', async () => {
    const { root } = repoFrom('settings-only-workspace');
    const result = await init(root);
    expect(result.out).toContain(
      'pnpm-workspace.yaml holds back new package versions for 10080 minutes',
    );
    expect(result.out).toContain(
      "  minimumReleaseAgeExclude:\n    - '@oaknational/oak-agent-skills'",
    );
  });

  it('says nothing when the package is already exempt', async () => {
    const { root } = repoFrom('workspace', {
      'pnpm-workspace.yaml':
        "packages:\n  - apps/*\nminimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - '@oaknational/*'\n",
    });
    expect((await init(root)).out).not.toContain('pnpm-workspace.yaml holds back');
  });
});

describe('oak-skills init warnings and errors', () => {
  it('warns when the package is a dependency rather than a dev dependency', async () => {
    const { root } = repoFrom();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'x', dependencies: { '@oaknational/oak-agent-skills': '1.2.3' } }),
    );
    expect((await init(root)).err).toContain('is in dependencies. Move it to devDependencies');
  });

  it('is quiet when the package is a dev dependency, and flags a missing packageManager', async () => {
    const { root } = repoFrom();
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ name: 'x', devDependencies: { '@oaknational/oak-agent-skills': '1.2.3' } }),
    );
    const result = await init(root);
    expect(result.err).toBe('');
    expect(result.out).toContain('- [ ] package.json has a packageManager field');
  });

  it.each(['OWA', 'abcde', 'o'])('rejects the bundle code "%s" with exit code 5', async (code) => {
    const repo = repoFrom();
    const result = await init(repo.root, '--bundle', code);
    expect(result.code).toBe(ExitCode.Configuration);
    expect(result.err).toContain(`--bundle "${code}" isn't a repository code`);
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  it('rejects a bundle the package does not have, and writes nothing', async () => {
    const repo = repoFrom();
    const result = await init(repo.root, '--bundle', 'xyz');
    expect(result.code).toBe(ExitCode.Configuration);
    expect(result.err).toContain('unknown bundle "xyz"');
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  it('exits 4, after setting up, when an unmanaged folder blocks a skill', async () => {
    const { root } = repoFrom('single-package', {
      '.agents/skills/oak-alpha/SKILL.md': 'our own copy',
    });
    const result = await init(root);
    expect(result.code).toBe(ExitCode.Unmanaged);
    expect(result.err).toContain(
      "Error: .agents/skills/oak-alpha holds files oak-skills didn't write",
    );
    expect(existsSync(join(root, 'AGENTS.md'))).toBe(true);
  });

  it('notes unmanaged skills that check would fail on', async () => {
    const { root } = repoFrom('single-package', {
      '.claude/skills/old-skill/SKILL.md': 'x',
      '.agents/skills/team-notes/SKILL.md': 'y',
    });
    const { err } = await init(root);
    expect(err).toContain("Note: .agents/skills/team-notes wasn't written by oak-skills.");
    expect(err).toContain(
      "Note: .claude/skills/old-skill wasn't written by oak-skills. Move a skill like this into the central repository",
    );
  });

  it('reports a link conflict', async () => {
    const { root } = repoFrom('single-package', { '.claude/skills/oak-alpha/SKILL.md': 'x' });
    const result = await init(root);
    expect(result.code).toBe(ExitCode.Unmanaged);
    expect(result.err).toContain(
      "Error: .claude/skills/oak-alpha is something oak-skills didn't write",
    );
  });

  it('passes on a warning from resolving the skills', async () => {
    const { root } = repoFrom();
    setOakSkills(root, { profiles: ['base'], exclude: ['oak-gamma'] });
    expect((await init(root)).err).toContain('Warning: exclude lists "oak-gamma"');
  });
});
