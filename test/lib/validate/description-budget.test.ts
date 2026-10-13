import { describe, expect, it } from 'vitest';
import {
  checkDescriptionBudget,
  DESCRIPTION_BUDGET,
  LISTING_COPIES,
} from '../../../src/lib/validate/description-budget.ts';
import type { CheckedSkill } from '../../../src/lib/validate/skill-checks.ts';

function skill(name: string, descriptionLength: number, bundle?: string): CheckedSkill {
  return {
    location: {
      name,
      bundle,
      path: bundle === undefined ? `skills/central/${name}` : `skills/repos/${bundle}/${name}`,
    },
    frontmatter: {
      name,
      description: 'x'.repeat(descriptionLength),
      license: 'MIT',
      metadata: { owner: '@oaknational/skills-maintainers', updated: '2026-10-13' },
    },
    problems: [],
  };
}

const perCopy = DESCRIPTION_BUDGET / LISTING_COPIES;

describe('checkDescriptionBudget', () => {
  it('passes when every bundle plus the shared skills fits, counted twice', () => {
    expect(
      checkDescriptionBudget([
        skill('oak-a', perCopy - 1000),
        skill('owa-a', 1000, 'owa'),
        skill('oc-a', 999, 'oc'),
      ]),
    ).toEqual([]);
  });

  it('fails when the shared skills alone are over budget', () => {
    expect(checkDescriptionBudget([skill('oak-a', perCopy), skill('oak-b', 1)])).toEqual([
      {
        file: 'skills/central',
        message: `The shared skills have descriptions totalling ${String(perCopy + 1)} characters, listed 2 times: ${String(DESCRIPTION_BUDGET + 2)}, over the budget of ${String(DESCRIPTION_BUDGET)}. Shorten descriptions, or merge skills that do the same kind of task.`,
      },
    ]);
  });

  it('fails only the bundle that takes the total over budget', () => {
    const problems = checkDescriptionBudget([
      skill('oak-a', perCopy - 10),
      skill('owa-a', 11, 'owa'),
      skill('owa-b', 0, 'owa'),
      skill('oc-a', 10, 'oc'),
    ]);
    expect(problems.map((p) => p.file)).toEqual(['skills/repos/owa']);
    expect(problems[0]?.message).toContain('The shared skills and the owa bundle');
  });

  it('reports bundles in a stable order', () => {
    const problems = checkDescriptionBudget([
      skill('oak-a', perCopy),
      skill('zz-a', 1, 'zz'),
      skill('aa-a', 1, 'aa'),
      skill('mm-a', 1, 'mm'),
    ]);
    expect(problems.map((p) => p.file)).toEqual([
      'skills/repos/aa',
      'skills/repos/mm',
      'skills/repos/zz',
    ]);
  });

  it('ignores skills whose frontmatter is invalid', () => {
    expect(
      checkDescriptionBudget([{ ...skill('oak-a', DESCRIPTION_BUDGET), frontmatter: undefined }]),
    ).toEqual([]);
  });
});
