import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/lib/exit-codes.ts';
import {
  findRepositoryRoot,
  isPnpmWorkspace,
  listsWorkspacePackages,
  readRootPackageJson,
} from '../../src/lib/root.ts';
import { createTempRepo, type FixtureName, type TempRepo } from '../helpers/temp-repo.ts';
import { makeTempDir, removeTree } from '../helpers/tree.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function repo(fixture: FixtureName): TempRepo {
  const created = createTempRepo(fixture);
  cleanups.push(created.cleanup);
  return created;
}

describe('findRepositoryRoot', () => {
  it('finds the root from the root itself', () => {
    const single = repo('single-package');
    expect(findRepositoryRoot(single.root)).toBe(single.root);
  });

  it.each(['apps/web', 'packages/ui'])(
    'finds the workspace root from the package folder %s',
    (folder) => {
      const workspace = repo('workspace');
      expect(findRepositoryRoot(join(workspace.root, folder))).toBe(workspace.root);
    },
  );

  it('fails with the configuration exit code outside git', () => {
    const dir = makeTempDir('no-git');
    cleanups.push(() => {
      removeTree(dir);
    });
    expect(() => findRepositoryRoot(dir)).toThrow(
      expect.objectContaining({
        exitCode: ExitCode.Configuration,
        message: expect.stringContaining('oak-skills must run inside a git repository') as unknown,
      }),
    );
  });
});

describe('readRootPackageJson', () => {
  it('reads the root package.json', () => {
    expect(readRootPackageJson(repo('workspace').root)).toMatchObject({
      name: 'workspace-fixture',
    });
  });

  it.each([
    ['missing', undefined, 'has no package.json'],
    ['invalid JSON', '{', "isn't valid JSON"],
    ['an array', '[]', 'must hold a JSON object'],
    ['null', 'null', 'must hold a JSON object'],
  ])('fails when package.json is %s', (_label, contents, message) => {
    const single = repo('single-package');
    if (contents === undefined) removeTree(join(single.root, 'package.json'));
    else writeFileSync(join(single.root, 'package.json'), contents);
    expect(() => readRootPackageJson(single.root)).toThrow(message);
    expect(() => readRootPackageJson(single.root)).toThrow(
      expect.objectContaining({ exitCode: ExitCode.Configuration }),
    );
  });
});

describe('isPnpmWorkspace', () => {
  it.each<[FixtureName, boolean]>([
    ['single-package', false],
    ['settings-only-workspace', false],
    ['workspace', true],
  ])('treats the %s fixture as a workspace: %s', (fixture, expected) => {
    expect(isPnpmWorkspace(repo(fixture).root)).toBe(expected);
  });
});

describe('listsWorkspacePackages', () => {
  it.each([
    ['a block list', 'packages:\n  - apps/*\n  - packages/*\n', true],
    ['a block list without indentation', 'packages:\n- apps/*\n', true],
    ['a block list after settings', 'minimumReleaseAge: 10080\npackages:\n  - "apps/*"\n', true],
    ['a flow list', "packages: ['apps/*', 'packages/*']\n", true],
    ['a list with comments', 'packages: # the apps\n  # first\n  - apps/* # web\n', true],
    ['Windows line endings', 'packages:\r\n  - apps/*\r\n', true],
    ['settings only', 'minimumReleaseAge: 10080\nonlyBuiltDependencies:\n  - esbuild\n', false],
    ['an empty flow list', 'packages: []\n', false],
    ['an empty block', 'packages:\nminimumReleaseAge: 10080\n', false],
    ['packages at the end with nothing after', 'packages:\n', false],
    ['a commented-out packages key', '# packages:\n#   - apps/*\n', false],
    ['a nested packages key', 'catalog:\n  packages:\n    - x\n', false],
    ['an empty file', '', false],
  ])('%s: %s', (_label, yaml, expected) => {
    expect(listsWorkspacePackages(yaml)).toBe(expected);
  });
});
