import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { findCentralRoot, findSkills } from '../../../src/lib/validate/central-repo.ts';
import { createTempRepo, type TempRepo } from '../../helpers/temp-repo.ts';
import { makeTempDir, removeTree, writeTree } from '../../helpers/tree.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function repo(fixture: Parameters<typeof createTempRepo>[0]): TempRepo {
  const created = createTempRepo(fixture);
  cleanups.push(created.cleanup);
  return created;
}

function tempDir(): string {
  const dir = makeTempDir('central');
  cleanups.push(() => {
    removeTree(dir);
  });
  return dir;
}

describe('findCentralRoot', () => {
  it('finds the root from the root and from a subfolder', () => {
    const central = repo('central-repo');
    expect(findCentralRoot(central.root)).toBe(central.root);
    expect(findCentralRoot(join(central.root, 'skills/central'))).toBe(central.root);
  });

  it.each(['single-package', 'workspace'] as const)(
    'refuses another repository (%s)',
    (fixture) => {
      expect(() => findCentralRoot(repo(fixture).root)).toThrow(
        'oak-skills validate only runs in the central oak-agent-skills repository.',
      );
    },
  );

  it('refuses a repository with no package.json', () => {
    const other = repo('single-package');
    removeTree(join(other.root, 'package.json'));
    expect(() => findCentralRoot(other.root)).toThrow('only runs in the central');
  });

  it('refuses a folder outside git', () => {
    expect(() => findCentralRoot(tempDir())).toThrow('only runs in the central');
  });
});

describe('findSkills', () => {
  it('finds nothing when there is no skills folder', () => {
    expect(findSkills(tempDir())).toEqual({ skills: [], problems: [] });
  });

  it('finds shared and bundle skills, sorted', () => {
    const root = tempDir();
    writeTree(root, {
      'skills/profiles.json': '{}',
      'skills/central/oak-b/SKILL.md': '',
      'skills/central/oak-a/SKILL.md': '',
      'skills/repos/owa/owa-x/SKILL.md': '',
      'skills/repos/oc/oc-y/SKILL.md': '',
    });
    expect(findSkills(root)).toEqual({
      problems: [],
      skills: [
        { name: 'oak-a', bundle: undefined, path: 'skills/central/oak-a' },
        { name: 'oak-b', bundle: undefined, path: 'skills/central/oak-b' },
        { name: 'oc-y', bundle: 'oc', path: 'skills/repos/oc/oc-y' },
        { name: 'owa-x', bundle: 'owa', path: 'skills/repos/owa/owa-x' },
      ],
    });
  });

  it('copes with only bundle skills', () => {
    const root = tempDir();
    writeTree(root, { 'skills/repos/ora/ora-x/SKILL.md': '' });
    expect(findSkills(root)).toEqual({
      problems: [],
      skills: [{ name: 'ora-x', bundle: 'ora', path: 'skills/repos/ora/ora-x' }],
    });
  });

  it('reports unexpected entries, stray files and invalid repository codes', () => {
    const root = tempDir();
    writeTree(root, {
      'skills/README.md': '',
      'skills/central/notes.md': '',
      'skills/repos/owa/stray.md': '',
      'skills/repos/abcde/x-a/SKILL.md': '',
      'skills/repos/O1/o1-a/SKILL.md': '',
    });
    mkdirSync(join(root, 'skills/extra'));
    writeFileSync(join(root, 'skills/repos/notes.txt'), '');
    expect(findSkills(root).problems).toEqual([
      {
        file: 'skills/README.md',
        message: "isn't expected here. skills/ holds only central/, repos/ and profiles.json.",
      },
      {
        file: 'skills/extra',
        message: "isn't expected here. skills/ holds only central/, repos/ and profiles.json.",
      },
      { file: 'skills/central/notes.md', message: 'should be a skill folder' },
      { file: 'skills/repos/notes.txt', message: 'should be a skill folder' },
      {
        file: 'skills/repos/O1',
        message: 'is not a valid repository code. Codes are two to four lowercase letters.',
      },
      {
        file: 'skills/repos/abcde',
        message: 'is not a valid repository code. Codes are two to four lowercase letters.',
      },
      { file: 'skills/repos/owa/stray.md', message: 'should be a skill folder' },
    ]);
  });
});
