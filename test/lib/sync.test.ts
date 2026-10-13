import {
  existsSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { MANIFEST_PATH, readManifest } from '../../src/lib/manifest.ts';
import { applySync, hasChanges, planSync } from '../../src/lib/sync.ts';
import { copyPackage, setOakSkills, setPackageVersion } from '../helpers/consumer.ts';
import { packageFixture } from '../helpers/paths.ts';
import { createTempRepo, type FixtureName, type TempRepo } from '../helpers/temp-repo.ts';
import { removeTree, writeTree } from '../helpers/tree.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function consumer(
  fixture: FixtureName = 'single-package',
  oakSkills: unknown = { profiles: ['base'] },
): TempRepo {
  const repo = createTempRepo(fixture);
  cleanups.push(repo.cleanup);
  setOakSkills(repo.root, oakSkills);
  return repo;
}

function packageCopy(): string {
  const dir = copyPackage();
  cleanups.push(() => {
    removeTree(dir);
  });
  return dir;
}

function sync(root: string, packageDir = packageFixture) {
  const plan = planSync(root, packageDir);
  applySync(plan);
  return plan;
}

const read = (root: string, path: string) => readFileSync(join(root, path), 'utf8');

describe('a first sync', () => {
  it('copies the skills, links them and writes the manifest', () => {
    const { root } = consumer('single-package', { profiles: ['base'], bundle: 'owa' });
    const plan = sync(root);
    expect(plan.add.map((s) => s.name)).toEqual(['oak-alpha', 'oak-beta', 'owa-routing']);
    expect(read(root, '.agents/skills/oak-alpha/references/guide.md')).toBe(
      read(packageFixture, 'skills/central/oak-alpha/references/guide.md'),
    );
    expect(readlinkSync(join(root, '.claude/skills/owa-routing'))).toBe(
      '../../.agents/skills/owa-routing',
    );
    expect(readManifest(root)).toMatchObject({
      package: { version: '1.2.3' },
      config: { profiles: ['base'], bundle: 'owa', include: [], exclude: [] },
      skills: { 'owa-routing': { source: 'skills/repos/owa/owa-routing' } },
    });
  });

  it.each<FixtureName>(['settings-only-workspace', 'workspace'])(
    'works at the root of the %s fixture',
    (fixture) => {
      const { root } = consumer(fixture);
      expect(sync(root).add).toHaveLength(2);
    },
  );

  it('acts on the repository root when run from a workspace package', () => {
    const { root } = consumer('workspace');
    sync(join(root, 'apps/web'));
    expect(existsSync(join(root, '.agents/skills/oak-alpha/SKILL.md'))).toBe(true);
    expect(existsSync(join(root, 'apps/web/.agents'))).toBe(false);
  });

  it('adopts a folder that already matches the package', () => {
    const { root } = consumer();
    writeTree(root, {
      '.agents/skills/oak-beta/SKILL.md': read(packageFixture, 'skills/central/oak-beta/SKILL.md'),
    });
    const plan = sync(root);
    expect(plan).toMatchObject({ unchanged: ['oak-beta'], conflicts: [] });
    expect(readManifest(root)?.skills['oak-beta']).toBeDefined();
  });
});

describe('running sync again', () => {
  it('changes nothing the second time', () => {
    const repo = consumer();
    sync(repo.root);
    repo.git('add', '--all');
    repo.git('commit', '--quiet', '--message', 'chore: sync');
    const second = planSync(repo.root, packageFixture);
    expect(hasChanges(second)).toBe(false);
    applySync(second);
    expect(repo.git('status', '--porcelain')).toBe('');
  });

  it('plans exactly what it then does: a dry run and a real run agree', () => {
    const { root } = consumer('single-package', { profiles: ['base', 'frontend'], bundle: 'oc' });
    const dryRun = planSync(root, packageFixture);
    expect(existsSync(join(root, '.agents'))).toBe(false);
    const real = sync(root);
    expect(real).toEqual(dryRun);
    expect(hasChanges(planSync(root, packageFixture))).toBe(false);
  });
});

describe('changes between syncs', () => {
  it('updates a skill that changed in a new version, and records the version', () => {
    const { root } = consumer();
    sync(root);
    const pkg = packageCopy();
    writeFileSync(
      join(pkg, 'skills/central/oak-beta/SKILL.md'),
      `${read(pkg, 'skills/central/oak-beta/SKILL.md')}\nMore.\n`,
    );
    setPackageVersion(pkg, '1.3.0');
    const plan = sync(root, pkg);
    expect(plan).toMatchObject({
      update: [{ name: 'oak-beta' }],
      unchanged: ['oak-alpha'],
      replacedEdits: [],
    });
    expect(read(root, '.agents/skills/oak-beta/SKILL.md')).toContain('More.');
    expect(readManifest(root)?.package.version).toBe('1.3.0');
  });

  it('rewrites only the manifest when just the version changes', () => {
    const { root } = consumer();
    sync(root);
    const pkg = packageCopy();
    setPackageVersion(pkg, '1.2.4');
    const plan = sync(root, pkg);
    expect(plan).toMatchObject({ add: [], update: [], remove: [], manifestChanged: true });
    expect(hasChanges(plan)).toBe(true);
  });

  it('removes skills and links that are no longer subscribed', () => {
    const { root } = consumer('single-package', { profiles: ['base'], bundle: 'owa' });
    sync(root);
    setOakSkills(root, { profiles: ['base'], exclude: ['oak-beta'] });
    const plan = sync(root);
    expect(plan.remove).toEqual(['oak-beta', 'owa-routing']);
    expect(plan.links.remove).toEqual(['oak-beta', 'owa-routing']);
    expect(existsSync(join(root, '.agents/skills/oak-beta'))).toBe(false);
    expect(existsSync(join(root, '.claude/skills/owa-routing'))).toBe(false);
    expect(Object.keys(readManifest(root)?.skills ?? {})).toEqual(['oak-alpha']);
  });

  it('skips a previously synced skill that someone already deleted', () => {
    const { root } = consumer();
    sync(root);
    removeTree(join(root, '.agents/skills/oak-beta'));
    setOakSkills(root, { profiles: [], include: ['oak-alpha'] });
    expect(sync(root).remove).toEqual([]);
  });

  it('replaces local edits, and says which files it replaced', () => {
    const { root } = consumer();
    sync(root);
    writeFileSync(join(root, '.agents/skills/oak-alpha/SKILL.md'), 'edited locally');
    writeFileSync(join(root, '.agents/skills/oak-alpha/notes.md'), 'added locally');
    const plan = sync(root);
    expect(plan.update.map((s) => s.name)).toEqual(['oak-alpha']);
    expect(plan.replacedEdits).toEqual([
      '.agents/skills/oak-alpha/SKILL.md',
      '.agents/skills/oak-alpha/notes.md',
    ]);
    expect(read(root, '.agents/skills/oak-alpha/SKILL.md')).toBe(
      read(packageFixture, 'skills/central/oak-alpha/SKILL.md'),
    );
    expect(existsSync(join(root, '.agents/skills/oak-alpha/notes.md'))).toBe(false);
  });

  it('warns about local edits in a skill it removes', () => {
    const { root } = consumer();
    sync(root);
    writeFileSync(join(root, '.agents/skills/oak-beta/SKILL.md'), 'edited locally');
    setOakSkills(root, { profiles: ['base'], exclude: ['oak-beta'] });
    expect(sync(root).replacedEdits).toEqual(['.agents/skills/oak-beta/SKILL.md']);
  });
});

describe('things sync did not write', () => {
  it('reports unmanaged folders and leaves them alone', () => {
    const { root } = consumer();
    writeTree(root, {
      '.agents/skills/team-notes/SKILL.md': 'ours',
      '.claude/skills/my-skill/SKILL.md': 'mine',
    });
    const plan = sync(root);
    expect(plan.unmanaged).toEqual(['team-notes']);
    expect(plan.links.unmanaged).toEqual(['my-skill']);
    expect(read(root, '.agents/skills/team-notes/SKILL.md')).toBe('ours');
    expect(read(root, '.claude/skills/my-skill/SKILL.md')).toBe('mine');
  });

  it('will not overwrite a folder it did not write that has a wanted skill name', () => {
    const { root } = consumer();
    writeTree(root, { '.agents/skills/oak-alpha/SKILL.md': 'a different skill' });
    const plan = sync(root);
    expect(plan.conflicts).toEqual(['oak-alpha']);
    expect(read(root, '.agents/skills/oak-alpha/SKILL.md')).toBe('a different skill');
    expect(readManifest(root)?.skills['oak-alpha']).toBeUndefined();
    expect(existsSync(join(root, '.claude/skills/oak-alpha'))).toBe(false);
  });

  it('treats a file where a skill folder should be as a conflict', () => {
    const { root } = consumer();
    writeTree(root, { '.agents/skills/oak-alpha': 'a file' });
    expect(sync(root).conflicts).toEqual(['oak-alpha']);
  });

  it('leaves out a link whose place is taken, and records only the links it made', () => {
    const { root } = consumer();
    writeTree(root, { '.claude/skills/oak-alpha/SKILL.md': 'a local copy' });
    const plan = sync(root);
    expect(plan.links.conflicts).toEqual(['oak-alpha']);
    expect(readManifest(root)?.symlinks.map((l) => l.path)).toEqual(['.claude/skills/oak-beta']);
  });

  it('replaces a link it made before that now points elsewhere', () => {
    const { root } = consumer();
    sync(root);
    removeTree(join(root, '.claude/skills/oak-alpha'));
    mkdirSync(join(root, '.claude/skills'), { recursive: true });
    symlinkSync('../../somewhere', join(root, '.claude/skills/oak-alpha'));
    expect(sync(root).links.replace).toEqual(['oak-alpha']);
    expect(readlinkSync(join(root, '.claude/skills/oak-alpha'))).toBe(
      '../../.agents/skills/oak-alpha',
    );
  });

  it('never lists the manifest as unmanaged', () => {
    const { root } = consumer();
    sync(root);
    expect(planSync(root, packageFixture).unmanaged).toEqual([]);
    expect(existsSync(join(root, MANIFEST_PATH))).toBe(true);
  });
});
