import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/lib/exit-codes.ts';
import { computeStatus, statusExitCode } from '../../src/lib/status.ts';
import { applySync, planSync } from '../../src/lib/sync.ts';
import { copyPackage, setOakSkills, setPackageVersion } from '../helpers/consumer.ts';
import { packageFixture } from '../helpers/paths.ts';
import { createTempRepo, type TempRepo } from '../helpers/temp-repo.ts';
import { removeTree, writeTree } from '../helpers/tree.ts';

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function synced(
  oakSkills: unknown = { profiles: ['base'] },
  packageDir = packageFixture,
): TempRepo {
  const repo = createTempRepo('single-package');
  cleanups.push(repo.cleanup);
  setOakSkills(repo.root, oakSkills);
  applySync(planSync(repo.root, packageDir));
  return repo;
}

function packageAt(version: string): string {
  const dir = copyPackage();
  cleanups.push(() => {
    removeTree(dir);
  });
  setPackageVersion(dir, version);
  return dir;
}

function status(root: string, packageDir = packageFixture) {
  const report = computeStatus(root, packageDir);
  return { report, code: statusExitCode(report) };
}

describe('computeStatus', () => {
  it('is clean straight after a sync', () => {
    const { root } = synced();
    const { report, code } = status(root);
    expect(code).toBe(ExitCode.Ok);
    expect(report).toMatchObject({
      toolVersion: '1.2.3',
      syncedVersion: '1.2.3',
      clean: ['oak-alpha', 'oak-beta'],
      edited: [],
      outOfDate: [],
      unmanaged: [],
      configProblems: [],
    });
  });

  describe('exit code 1: edited', () => {
    it.each([
      [
        'a changed file',
        (root: string) => {
          writeFileSync(join(root, '.agents/skills/oak-alpha/SKILL.md'), 'edited');
        },
        ['.agents/skills/oak-alpha/SKILL.md'],
      ],
      [
        'a deleted file',
        (root: string) => {
          rmSync(join(root, '.agents/skills/oak-alpha/references/guide.md'));
        },
        ['.agents/skills/oak-alpha/references/guide.md'],
      ],
      [
        'an added file',
        (root: string) => {
          writeFileSync(join(root, '.agents/skills/oak-alpha/notes.md'), 'x');
        },
        ['.agents/skills/oak-alpha/notes.md'],
      ],
      [
        'a deleted skill folder',
        (root: string) => {
          removeTree(join(root, '.agents/skills/oak-alpha'));
        },
        ['.agents/skills/oak-alpha/SKILL.md', '.agents/skills/oak-alpha/references/guide.md'],
      ],
      [
        'a deleted link',
        (root: string) => {
          rmSync(join(root, '.claude/skills/oak-alpha'));
        },
        ['.claude/skills/oak-alpha has been deleted'],
      ],
    ])('reports %s', (_label, change, edited) => {
      const { root } = synced();
      change(root);
      const { report, code } = status(root);
      expect(code).toBe(ExitCode.Edited);
      expect(report.edited).toEqual(edited);
      expect(report.clean).toEqual(['oak-beta']);
    });

    it('reports a link that now points somewhere else', () => {
      const { root } = synced();
      rmSync(join(root, '.claude/skills/oak-beta'));
      symlinkSync('../../elsewhere', join(root, '.claude/skills/oak-beta'));
      expect(status(root).report.edited).toEqual([
        '.claude/skills/oak-beta points somewhere else now',
      ]);
    });

    it('reports a link replaced by a folder', () => {
      const { root } = synced();
      rmSync(join(root, '.claude/skills/oak-beta'));
      mkdirSync(join(root, '.claude/skills/oak-beta'));
      expect(status(root).report.edited).toEqual([
        ".claude/skills/oak-beta has been replaced by something that isn't a link",
      ]);
    });
  });

  describe('exit code 2: out of date', () => {
    it('reports a newer installed version', () => {
      const { root } = synced();
      const { report, code } = status(root, packageAt('1.3.0'));
      expect(code).toBe(ExitCode.VersionMismatch);
      expect(report.outOfDate).toEqual([
        'The skills were synced from version 1.2.3, but version 1.3.0 is installed.',
      ]);
    });

    it('reports a pin to an older version', () => {
      const newer = packageAt('1.3.0');
      const { root } = synced({ profiles: ['base'] }, newer);
      expect(status(root).code).toBe(ExitCode.VersionMismatch);
      expect(status(root).report.outOfDate[0]).toContain(
        'synced from version 1.3.0, but version 1.2.3 is installed',
      );
    });

    it('reports oakSkills changes that have not been synced', () => {
      const { root } = synced();
      setOakSkills(root, { profiles: ['base', 'frontend'], exclude: ['oak-beta'] });
      const { report, code } = status(root);
      expect(code).toBe(ExitCode.VersionMismatch);
      expect(report.outOfDate).toEqual([
        "oakSkills now includes oak-gamma, which isn't synced.",
        'oak-beta is synced, but oakSkills no longer includes it.',
      ]);
    });

    it('reports a repository that has never synced', () => {
      const repo = createTempRepo('single-package');
      cleanups.push(repo.cleanup);
      setOakSkills(repo.root, { profiles: ['base'] });
      const { report, code } = status(repo.root);
      expect(code).toBe(ExitCode.VersionMismatch);
      expect(report).toMatchObject({
        syncedVersion: undefined,
        outOfDate: ['No skills have been synced yet.'],
      });
    });
  });

  it('exit code 3: edited and out of date', () => {
    const { root } = synced();
    writeFileSync(join(root, '.agents/skills/oak-alpha/SKILL.md'), 'edited');
    expect(status(root, packageAt('1.3.0')).code).toBe(ExitCode.EditedAndVersionMismatch);
  });

  describe('exit code 4: unmanaged', () => {
    it('reports folders sync did not write, in either skills folder, and beats edits and versions', () => {
      const { root } = synced();
      writeFileSync(join(root, '.agents/skills/oak-alpha/SKILL.md'), 'edited');
      writeTree(root, {
        '.agents/skills/oak-local/SKILL.md': 'x',
        '.claude/skills/team-skill/SKILL.md': 'y',
      });
      const { report, code } = status(root, packageAt('1.3.0'));
      expect(code).toBe(ExitCode.Unmanaged);
      expect(report.unmanaged).toEqual(['.agents/skills/oak-local', '.claude/skills/team-skill']);
    });

    it('reports existing folders in a repository that has never synced', () => {
      const repo = createTempRepo('single-package');
      cleanups.push(repo.cleanup);
      setOakSkills(repo.root, { profiles: ['base'] });
      writeTree(repo.root, { '.claude/skills/old-skill/SKILL.md': 'x' });
      expect(status(repo.root)).toMatchObject({
        code: ExitCode.Unmanaged,
        report: { unmanaged: ['.claude/skills/old-skill'] },
      });
    });
  });

  describe('exit code 5: configuration', () => {
    it('reports unknown names, and beats everything else', () => {
      const { root } = synced();
      writeTree(root, { '.agents/skills/oak-local/SKILL.md': 'x' });
      setOakSkills(root, { profiles: ['nope'] });
      const { report, code } = status(root);
      expect(code).toBe(ExitCode.Configuration);
      expect(report.configProblems[0]).toContain('unknown profile "nope"');
    });

    it('reports missing oakSkills settings with the fix', () => {
      const repo = createTempRepo('single-package');
      cleanups.push(repo.cleanup);
      expect(status(repo.root).report.configProblems).toEqual([
        'package.json has no oakSkills settings. Run "oak-skills init" to add them.',
      ]);
    });

    it('lets other errors through, such as a broken install', () => {
      const { root } = synced();
      const broken = packageAt('1.2.3');
      removeTree(join(broken, 'skills'));
      expect(() => computeStatus(root, broken)).toThrow(
        'The installed package has no skills/profiles.json',
      );
    });
  });
});
