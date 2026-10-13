import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Profiles } from '../../../src/lib/validate/profiles.ts';
import {
  checkReadmeTable,
  renderSkillsTable,
  replaceSkillsTable,
  TABLE_END,
  TABLE_START,
} from '../../../src/lib/validate/readme-table.ts';
import type { CheckedSkill } from '../../../src/lib/validate/skill-checks.ts';
import { makeTempDir, removeTree, writeTree } from '../../helpers/tree.ts';

function skill(name: string, description: string, bundle?: string): CheckedSkill {
  return {
    location: {
      name,
      bundle,
      path: bundle === undefined ? `skills/central/${name}` : `skills/repos/${bundle}/${name}`,
    },
    frontmatter: {
      name,
      description,
      license: 'MIT',
      metadata: { owner: '@oaknational/skills-maintainers', updated: '2025-06-01' },
    },
    problems: [],
  };
}

const profiles: Profiles = {
  version: 1,
  profiles: {
    base: { description: 'Everywhere', skills: ['oak-review'] },
    frontend: { description: 'Interfaces', skills: ['oak-a11y', 'oak-review'] },
  },
};

describe('renderSkillsTable', () => {
  it('lists shared skills first, then bundles, with their profiles and descriptions', () => {
    const table = renderSkillsTable(
      [
        skill('owa-routing', 'Routes.', 'owa'),
        skill('oak-review', 'Reviews | checks\nthings.'),
        skill('oak-a11y', 'Accessibility.'),
        skill('oak-orphan', 'In no profile.'),
        skill('oc-tokens', 'Tokens.', 'oc'),
        { ...skill('oak-broken', 'x'), frontmatter: undefined },
      ],
      profiles,
    );
    expect(table).toBe(
      [
        '| Skill | Profile or bundle | What it does |',
        '| --- | --- | --- |',
        '| [`oak-a11y`](skills/central/oak-a11y/SKILL.md) | `frontend` | Accessibility. |',
        '| [`oak-orphan`](skills/central/oak-orphan/SKILL.md) |  | In no profile. |',
        '| [`oak-review`](skills/central/oak-review/SKILL.md) | `base`, `frontend` | Reviews \\| checks things. |',
        '| [`oc-tokens`](skills/repos/oc/oc-tokens/SKILL.md) | The `oc` bundle | Tokens. |',
        '| [`owa-routing`](skills/repos/owa/owa-routing/SKILL.md) | The `owa` bundle | Routes. |',
      ].join('\n'),
    );
  });

  it('says when there are no skills, and copes with no profiles.json', () => {
    expect(renderSkillsTable([], undefined)).toBe('No skills have been published yet.');
    expect(renderSkillsTable([skill('oak-a', 'A.')], undefined)).toContain(
      '| [`oak-a`](skills/central/oak-a/SKILL.md) |  | A. |',
    );
  });
});

describe('replaceSkillsTable', () => {
  it('replaces whatever is between the markers', () => {
    expect(replaceSkillsTable(`# Title\n${TABLE_START}\nold\n${TABLE_END}\nAfter\n`, 'new')).toBe(
      `# Title\n${TABLE_START}\nnew\n${TABLE_END}\nAfter\n`,
    );
  });

  it.each([
    ['no markers', '# Title\n'],
    ['only a start marker', `${TABLE_START}\n`],
    ['markers in the wrong order', `${TABLE_END}\n${TABLE_START}\n`],
  ])('returns undefined with %s', (_label, readme) => {
    expect(replaceSkillsTable(readme, 'new')).toBeUndefined();
  });
});

describe('checkReadmeTable', () => {
  let root: string;
  beforeEach(() => {
    root = makeTempDir('readme');
  });
  afterEach(() => {
    removeTree(root);
  });

  const skills = [skill('oak-review', 'Reviews.')];

  it('passes an up-to-date table', () => {
    writeTree(root, {
      'README.md': `# Title\n\n${TABLE_START}\n${renderSkillsTable(skills, profiles)}\n${TABLE_END}\n`,
    });
    expect(checkReadmeTable(root, skills, profiles)).toEqual([]);
  });

  it('fails when a skill was added without regenerating the table', () => {
    writeTree(root, {
      'README.md': `# Title\n\n${TABLE_START}\n${renderSkillsTable(skills, profiles)}\n${TABLE_END}\n`,
    });
    expect(checkReadmeTable(root, [...skills, skill('oak-new', 'New.')], profiles)).toEqual([
      { file: 'README.md', message: 'has an out-of-date skills table. Run pnpm readme:skills.' },
    ]);
  });

  it('fails without the markers', () => {
    writeTree(root, { 'README.md': '# Title\n' });
    expect(checkReadmeTable(root, skills, profiles)[0]?.message).toMatch(/^has no skills table/);
  });

  it('fails without a README', () => {
    expect(checkReadmeTable(root, skills, profiles)).toEqual([
      { file: 'README.md', message: 'is missing' },
    ]);
  });

  it('round-trips: replacing the table makes the check pass', () => {
    writeTree(root, { 'README.md': `# Title\n\n${TABLE_START}\nstale\n${TABLE_END}\n` });
    const file = join(root, 'README.md');
    writeFileSync(
      file,
      replaceSkillsTable(readFileSync(file, 'utf8'), renderSkillsTable(skills, profiles)) ?? '',
    );
    expect(checkReadmeTable(root, skills, profiles)).toEqual([]);
  });
});
