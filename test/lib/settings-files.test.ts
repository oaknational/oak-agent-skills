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
  const npmUpdate = (body: string, extra = '') =>
    `version: 2\nupdates:\n  - package-ecosystem: npm\n    directory: /\n    schedule:\n      interval: daily\n${body}${extra}`;
  const ownGroup = `      oak-agent-skills:\n        patterns:\n          - '@oaknational/oak-agent-skills'\n`;
  const everything = `      everything:\n        patterns: ['*']\n`;
  const groups = (...blocks: string[]) => `    groups:\n${blocks.join('')}`;

  it('finds the package in its own group, listed before a catch-all', () => {
    expect(readDependabot(npmUpdate(groups(ownGroup, everything)))).toEqual({
      ownGroupFirst: true,
      catchAllGroups: [],
      hasCooldown: false,
      cooldownExempt: false,
    });
  });

  it('reports a catch-all group listed before its own group', () => {
    expect(readDependabot(npmUpdate(groups(everything, ownGroup)))).toMatchObject({
      ownGroupFirst: false,
      catchAllGroups: ['everything'],
    });
  });

  it.each([
    ['a "*" pattern', `      all:\n        patterns:\n          - "*"\n`, 'all'],
    [
      'no patterns at all',
      `      minor-and-patch:\n        update-types: [minor, patch]\n`,
      'minor-and-patch',
    ],
    [
      'a pattern for every Oak package',
      `      oak:\n        patterns: ['@oaknational/*']\n`,
      'oak',
    ],
  ])('treats a group with %s as a catch-all', (_label, group, name) => {
    expect(readDependabot(npmUpdate(groups(group)))).toMatchObject({
      ownGroupFirst: false,
      catchAllGroups: [name],
    });
  });

  it('reports a security-update catch-all even when the package has its own group first', () => {
    const security = `      npm-security:\n        applies-to: security-updates\n        patterns: ['*']\n`;
    expect(readDependabot(npmUpdate(groups(ownGroup, security)))).toMatchObject({
      ownGroupFirst: true,
      catchAllGroups: ['npm-security'],
    });
  });

  it.each([
    [
      'excludes the package',
      `      all:\n        patterns: ['*']\n        exclude-patterns:\n          - '@oaknational/oak-agent-skills'\n`,
    ],
    ['only takes production dependencies', `      prod:\n        dependency-type: production\n`],
    ['names other packages', `      react:\n        patterns: [react, react-dom]\n`],
  ])('ignores a group that %s', (_label, group) => {
    expect(readDependabot(npmUpdate(groups(group)))).toMatchObject({
      ownGroupFirst: false,
      catchAllGroups: [],
    });
  });

  it('reads only npm updates for the repository root', () => {
    const yaml = `${npmUpdate(groups(ownGroup))}  - package-ecosystem: npm\n    directory: /apps/web\n    groups:\n      all:\n        patterns: ['*']\n  - package-ecosystem: github-actions\n    directory: /\n    groups:\n      actions:\n        patterns: ['*']\n`;
    expect(readDependabot(yaml)).toMatchObject({ ownGroupFirst: true, catchAllGroups: [] });
  });

  it('reads update entries written at the same indent as updates:', () => {
    const yaml = `updates:\n- package-ecosystem: "npm"\n  directory: "/"\n  groups:\n    all:\n      patterns: ["*"]\n`;
    expect(readDependabot(yaml).catchAllGroups).toEqual(['all']);
  });

  it('finds no group when there is no npm update', () => {
    expect(readDependabot('updates:\n  - package-ecosystem: github-actions\n')).toMatchObject({
      ownGroupFirst: false,
      catchAllGroups: [],
      hasCooldown: false,
    });
  });

  it('finds a cooldown that does not exempt the package', () => {
    const cooldown = `    cooldown:\n      default-days: 7\n      exclude:\n        - '@oaknational/oak-components'\n`;
    expect(readDependabot(npmUpdate(groups(ownGroup), cooldown))).toMatchObject({
      hasCooldown: true,
      cooldownExempt: false,
    });
  });

  it('finds a cooldown without an exclude list', () => {
    expect(
      readDependabot(npmUpdate(groups(ownGroup), '    cooldown:\n      default-days: 7\n')),
    ).toMatchObject({ hasCooldown: true, cooldownExempt: false });
  });

  it('accepts a cooldown that exempts every Oak package', () => {
    const cooldown = `    cooldown:\n      default-days: 7\n      exclude: ["@oaknational/*"]\n`;
    expect(readDependabot(npmUpdate(groups(ownGroup), cooldown)).cooldownExempt).toBe(true);
  });

  it("ignores the github-actions update's cooldown, which never holds back the package", () => {
    const yaml = `${npmUpdate('', '    cooldown:\n      default-days: 7\n      exclude:\n        - "@oaknational/*"\n')}  - package-ecosystem: github-actions\n    directory: /\n    cooldown:\n      default-days: 7\n`;
    expect(readDependabot(yaml)).toMatchObject({ hasCooldown: true, cooldownExempt: true });
  });

  it('requires every root npm cooldown to exempt the package', () => {
    const update = (exclude: string) =>
      `  - package-ecosystem: npm\n    cooldown:\n      default-days: 7\n      exclude:\n        - '${exclude}'\n`;
    const yaml = `updates:\n${update('@oaknational/oak-agent-skills')}${update('react')}`;
    expect(readDependabot(yaml)).toMatchObject({ hasCooldown: true, cooldownExempt: false });
  });

  it('reads a cooldown that starts its update entry', () => {
    expect(
      readDependabot(
        'updates:\n  - cooldown:\n      exclude:\n        - "@oaknational/*"\n    package-ecosystem: npm\n',
      ),
    ).toMatchObject({ hasCooldown: true, cooldownExempt: true });
  });

  it("doesn't mistake a URL in a list for a key", () => {
    expect(
      readReleaseAge(
        'minimumReleaseAge: 60\nminimumReleaseAgeExclude:\n  - https://example.com/x\n',
      ).exempt,
    ).toBe(false);
  });

  it('ignores an exclude list that is not part of a cooldown', () => {
    const yaml = `updates:\n  - package-ecosystem: npm\n    ignore:\n      - dependency-name: x\n    exclude:\n      - '@oaknational/oak-agent-skills'\n    cooldown:\n      default-days: 3\n`;
    expect(readDependabot(yaml)).toMatchObject({ hasCooldown: true, cooldownExempt: false });
  });
});
