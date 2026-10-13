import { describe, expect, it } from 'vitest';
import { checkDeprecations } from '../../../src/lib/validate/deprecation.ts';
import type { CheckedSkill, Frontmatter } from '../../../src/lib/validate/skill-checks.ts';

function skill(name: string, description: string, deprecated?: string): CheckedSkill {
  const frontmatter: Frontmatter = {
    name,
    description,
    license: 'MIT',
    metadata: {
      owner: '@oaknational/skills-maintainers',
      updated: '2026-10-13',
      ...(deprecated === undefined ? {} : { deprecated }),
    },
  };
  return {
    location: { name, bundle: undefined, path: `skills/central/${name}` },
    frontmatter,
    problems: [],
  };
}

const replacement = skill('oak-review', 'Reviews code.');

describe('checkDeprecations', () => {
  it('passes a deprecated skill that says so and names an existing replacement', () => {
    expect(
      checkDeprecations([
        replacement,
        skill('oak-old', 'Deprecated: use oak-review.', 'oak-review'),
      ]),
    ).toEqual([]);
  });

  it('fails a deprecated skill whose description does not start with "Deprecated:"', () => {
    expect(
      checkDeprecations([replacement, skill('oak-old', 'Reviews code.', 'oak-review')]),
    ).toEqual([
      {
        file: 'skills/central/oak-old/SKILL.md',
        message: 'is deprecated, so its description must start with "Deprecated:"',
      },
    ]);
  });

  it('fails a replacement that does not exist', () => {
    expect(checkDeprecations([skill('oak-old', 'Deprecated: use oak-gone.', 'oak-gone')])).toEqual([
      {
        file: 'skills/central/oak-old/SKILL.md',
        message:
          "names oak-gone as its replacement in metadata.deprecated, but there's no skill with that name",
      },
    ]);
  });

  it('fails a skill that names itself as its replacement', () => {
    expect(checkDeprecations([skill('oak-old', 'Deprecated: use me.', 'oak-old')])).toEqual([
      {
        file: 'skills/central/oak-old/SKILL.md',
        message: 'names itself as its replacement in metadata.deprecated',
      },
    ]);
  });

  it('fails a description starting "Deprecated:" without metadata.deprecated', () => {
    expect(checkDeprecations([skill('oak-old', 'Deprecated: use oak-review.')])).toEqual([
      {
        file: 'skills/central/oak-old/SKILL.md',
        message:
          'has a description starting "Deprecated:" but no metadata.deprecated naming its replacement',
      },
    ]);
  });

  it('skips skills whose frontmatter is invalid', () => {
    const broken: CheckedSkill = { ...skill('oak-x', 'x'), frontmatter: undefined };
    expect(checkDeprecations([broken])).toEqual([]);
  });
});
