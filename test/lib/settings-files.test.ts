import { describe, expect, it } from 'vitest';
import { matchesPackage, readDependabot, readReleaseAge } from '../../src/lib/settings-files.ts';

describe('matchesPackage', () => {
  it.each([
    ['@oaknational/oak-agent-skills', true],
    ['@oaknational/*', true],
    ['*', true],
    ['@oaknational/oak-*', true],
    ['@oaknational/oak-components', false],
    ['oak-agent-skills', false],
    ['@oaknational/oak.agent-skills', false],
  ])('%s matches the package: %s', (pattern, expected) => {
    expect(matchesPackage(pattern)).toBe(expected);
  });
});

describe('readReleaseAge', () => {
  it.each([
    ['nothing set', 'packages:\n  - apps/*\n', { minutes: undefined, exempt: false }],
    [
      'a release age with no exemptions',
      'minimumReleaseAge: 10080\n',
      { minutes: 10080, exempt: false },
    ],
    [
      'other Oak packages exempted by name',
      'minimumReleaseAge: 10080 # a week\nminimumReleaseAgeExclude:\n  - \'@oaknational/oak-components\'\n  - "@oaknational/oak-curriculum-schema"\n',
      { minutes: 10080, exempt: false },
    ],
    [
      'every Oak package exempted with a wildcard',
      'minimumReleaseAge: 10080\nminimumReleaseAgeExclude:\n  - "@oaknational/*"\n',
      { minutes: 10080, exempt: true },
    ],
    [
      'the package exempted in a flow list',
      "minimumReleaseAge: 1440\nminimumReleaseAgeExclude: ['react', '@oaknational/oak-agent-skills']\n",
      { minutes: 1440, exempt: true },
    ],
    ['a release age of zero', 'minimumReleaseAge: 0\n', { minutes: undefined, exempt: false }],
    ['a quoted release age', "minimumReleaseAge: '60'\n", { minutes: 60, exempt: false }],
    [
      "a nested key that is not pnpm's",
      'catalog:\n  minimumReleaseAge: 99\n',
      { minutes: undefined, exempt: false },
    ],
  ])('reads %s', (_label, yaml, expected) => {
    expect(readReleaseAge(yaml)).toEqual(expected);
  });
});

describe('readDependabot', () => {
  const withGroup = `version: 2
updates:
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: daily
    groups:
      oak-agent-skills:
        patterns:
          - '@oaknational/oak-agent-skills'
      everything-else:
        patterns: ['*']
`;

  it('finds a group for the package and no cooldown', () => {
    expect(readDependabot(withGroup)).toEqual({
      hasGroup: true,
      hasCooldown: false,
      cooldownExempt: false,
    });
  });

  it('treats a catch-all group as covering the package', () => {
    expect(
      readDependabot('updates:\n  - groups:\n      all:\n        patterns:\n          - "*"\n')
        .hasGroup,
    ).toBe(true);
  });

  it('finds no group when none mentions the package', () => {
    expect(
      readDependabot('updates:\n  - groups:\n      react:\n        patterns: [react, react-dom]\n')
        .hasGroup,
    ).toBe(false);
  });

  it('finds a cooldown that does not exempt the package', () => {
    const yaml = `${withGroup}    cooldown:\n      default-days: 7\n      exclude:\n        - '@oaknational/oak-components'\n`;
    expect(readDependabot(yaml)).toEqual({
      hasGroup: true,
      hasCooldown: true,
      cooldownExempt: false,
    });
  });

  it('finds a cooldown without an exclude list', () => {
    expect(readDependabot(`${withGroup}    cooldown:\n      default-days: 7\n`)).toMatchObject({
      hasCooldown: true,
      cooldownExempt: false,
    });
  });

  it('accepts a cooldown that exempts every Oak package', () => {
    const yaml = `${withGroup}    cooldown:\n      default-days: 7\n      exclude: ["@oaknational/*"]\n`;
    expect(readDependabot(yaml).cooldownExempt).toBe(true);
  });

  it('requires every cooldown to exempt the package', () => {
    const update = (exclude: string) =>
      `  - package-ecosystem: npm\n    cooldown:\n      default-days: 7\n      exclude:\n        - '${exclude}'\n`;
    const yaml = `updates:\n${update('@oaknational/oak-agent-skills')}${update('react')}`;
    expect(readDependabot(yaml)).toMatchObject({ hasCooldown: true, cooldownExempt: false });
  });

  it('ignores an exclude list that is not part of a cooldown', () => {
    const yaml = `updates:\n  - ignore:\n      - dependency-name: x\n    exclude:\n      - '@oaknational/oak-agent-skills'\n    cooldown:\n      default-days: 3\n`;
    expect(readDependabot(yaml).cooldownExempt).toBe(false);
  });
});
