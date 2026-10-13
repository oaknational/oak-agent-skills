import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { repoRoot } from '../helpers/paths.ts';
import { createTempRepo } from '../helpers/temp-repo.ts';
import { skillText, writeTree } from '../helpers/tree.ts';

const script = join(repoRoot, 'scripts/readme-skills-table.ts');

describe('scripts/readme-skills-table.ts', () => {
  it('regenerates the table so validate passes again', () => {
    const repo = createTempRepo('central-repo');
    try {
      writeTree(repo.root, {
        'skills/central/oak-new/SKILL.md': skillText({
          name: 'oak-new',
          description: 'A new skill.',
        }),
        'skills/profiles.json': JSON.stringify({
          version: 1,
          profiles: {
            base: { description: 'Every repository', skills: ['oak-example', 'oak-new'] },
          },
        }),
      });
      const result = spawnSync(process.execPath, [script], { cwd: repo.root, encoding: 'utf8' });
      expect(result.stdout).toBe('Updated the skills table in README.md.\n');
      expect(result.status).toBe(0);
      expect(readFileSync(join(repo.root, 'README.md'), 'utf8')).toContain(
        '| [`oak-new`](skills/central/oak-new/SKILL.md) | `base` | A new skill. |',
      );
    } finally {
      repo.cleanup();
    }
  });

  it('fails without the markers', () => {
    const repo = createTempRepo('central-repo');
    try {
      writeTree(repo.root, { 'README.md': '# No table\n' });
      const result = spawnSync(process.execPath, [script], { cwd: repo.root, encoding: 'utf8' });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('README.md needs the');
    } finally {
      repo.cleanup();
    }
  });
});
