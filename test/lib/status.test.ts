import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/lib/exit-codes.ts';
import { MANIFEST_PATH, type Manifest } from '../../src/lib/manifest.ts';
import { computeStatus, statusExitCode } from '../../src/lib/status.ts';
import { sha256 } from '../../src/lib/hash.ts';
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
        'an added file named __proto__',
        (root: string) => {
          writeFileSync(join(root, '.agents/skills/oak-alpha/__proto__'), 'x');
        },
        ['.agents/skills/oak-alpha/__proto__'],
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

  describe('compared with the installed package', () => {
    const editManifest = (root: string, change: (manifest: Manifest) => void) => {
      const file = join(root, MANIFEST_PATH);
      const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
      change(manifest);
      writeFileSync(file, JSON.stringify(manifest));
    };

    it('reports a file edited together with its checksum in the manifest', () => {
      const { root } = synced();
      writeFileSync(join(root, '.agents/skills/oak-alpha/SKILL.md'), 'edited');
      editManifest(root, (manifest) => {
        const skill = manifest.skills['oak-alpha'];
        if (skill !== undefined) skill.files['SKILL.md'] = sha256('edited');
      });
      const { report, code } = status(root);
      expect(code).toBe(ExitCode.Edited);
      expect(report.edited).toEqual([
        '.agents/skills/oak-alpha/SKILL.md',
        `${MANIFEST_PATH} has checksums for oak-alpha that don't match version 1.2.3`,
      ]);
    });

    it('reports a manifest that gives a skill another source', () => {
      const { root } = synced();
      editManifest(root, (manifest) => {
        const skill = manifest.skills['oak-alpha'];
        if (skill !== undefined) skill.source = 'skills/central/oak-beta';
      });
      expect(status(root).report.edited).toEqual([
        `${MANIFEST_PATH} says oak-alpha comes from skills/central/oak-beta, not skills/central/oak-alpha`,
      ]);
    });

    it('reports a link the manifest adds for something that is not a synced skill', () => {
      const { root } = synced();
      writeTree(root, { 'elsewhere/SKILL.md': 'x' });
      symlinkSync('../../elsewhere', join(root, '.claude/skills/oak-extra'));
      editManifest(root, (manifest) => {
        manifest.symlinks.push({
          path: '.claude/skills/oak-extra',
          target: '../../.agents/skills/oak-extra',
        });
      });
      const { report, code } = status(root);
      expect(code).toBe(ExitCode.Unmanaged);
      expect(report.unmanaged).toEqual(['.claude/skills/oak-extra']);
      expect(report.edited).toEqual([
        `${MANIFEST_PATH} lists a link sync doesn't make: .claude/skills/oak-extra`,
      ]);
    });

    it("reports a manifest link swapped to another skill's folder", () => {
      const { root } = synced();
      rmSync(join(root, '.claude/skills/oak-beta'));
      symlinkSync('../../.agents/skills/oak-alpha', join(root, '.claude/skills/oak-beta'));
      editManifest(root, (manifest) => {
        manifest.symlinks = manifest.symlinks.map((link) =>
          link.path === '.claude/skills/oak-beta'
            ? { ...link, target: '../../.agents/skills/oak-alpha' }
            : link,
        );
      });
      const { report } = status(root);
      expect(report.edited).toEqual([
        `${MANIFEST_PATH} lists a link sync doesn't make: .claude/skills/oak-beta`,
      ]);
      expect(report.unmanaged).toEqual(['.claude/skills/oak-beta']);
    });

    it('reports a link added inside a skill', () => {
      const { root } = synced();
      symlinkSync('../../../package.json', join(root, '.agents/skills/oak-alpha/extra.md'));
      expect(status(root)).toMatchObject({
        code: ExitCode.Edited,
        report: {
          edited: [
            '.agents/skills/oak-alpha/extra.md is a link or special file, which sync never writes',
          ],
          clean: ['oak-beta'],
        },
      });
    });
  });

  describe('files git ignores', () => {
    it('leaves them out, in either skills folder and inside a skill', () => {
      const { root } = synced();
      writeTree(root, {
        '.gitignore': '*.local\n',
        '.agents/skills/notes.local': 'x',
        '.claude/skills/notes.local': 'x',
        '.agents/skills/oak-alpha/notes.local': 'x',
      });
      expect(status(root).code).toBe(ExitCode.Ok);
    });

    it('still reports a file that is committed, even if it matches an ignore rule', () => {
      const repo = synced();
      writeTree(repo.root, { '.agents/skills/oak-alpha/notes.local': 'x' });
      repo.git('add', '--all');
      repo.git('commit', '--quiet', '--message', 'chore: commit a local file');
      writeTree(repo.root, { '.gitignore': '*.local\n' });
      expect(status(repo.root).report.edited).toEqual(['.agents/skills/oak-alpha/notes.local']);
    });
  });

  it.each(['.agents/skills', '.claude/skills'])(
    'exit code 5 when %s is a link to the other skills folder',
    (linked) => {
      const { root } = synced();
      const other = linked === '.agents/skills' ? '.claude/skills' : '.agents/skills';
      removeTree(join(root, linked));
      symlinkSync(`../${other}`, join(root, linked));
      const { report, code } = status(root);
      expect(code).toBe(ExitCode.Configuration);
      expect(report.configProblems).toEqual([
        `${linked} is a link to ../${other}. oak-skills keeps the skills in .agents/skills/ and makes one link per skill in .claude/skills/, so both must be real folders. Remove the link, then run "oak-skills sync".`,
      ]);
    },
  );

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

    it.each(['constructor', 'toString', '__proto__'])(
      'reports a folder named %s, which every object inherits',
      (name) => {
        const { root } = synced();
        writeTree(root, { [`.agents/skills/${name}/SKILL.md`]: 'x' });
        expect(status(root)).toMatchObject({
          code: ExitCode.Unmanaged,
          report: { unmanaged: [`.agents/skills/${name}`] },
        });
      },
    );

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
