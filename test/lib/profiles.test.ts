import { describe, expect, it } from 'vitest';
import { readCatalogue } from '../../src/lib/catalogue.ts';
import { ExitCode } from '../../src/lib/exit-codes.ts';
import {
  readOakSkillsConfig,
  resolveSkills,
  type OakSkillsConfig,
} from '../../src/lib/profiles.ts';
import { packageFixture } from '../helpers/paths.ts';

const catalogue = readCatalogue(packageFixture);

function config(overrides: Partial<OakSkillsConfig> = {}): OakSkillsConfig {
  return { profiles: ['base'], bundle: undefined, include: [], exclude: [], ...overrides };
}

const names = (c: OakSkillsConfig) => resolveSkills(c, catalogue).skills.map((s) => s.name);

describe('readOakSkillsConfig', () => {
  it('reads the settings and fills in what is missing', () => {
    expect(readOakSkillsConfig({ oakSkills: { profiles: ['base'] } })).toEqual(config());
    expect(
      readOakSkillsConfig({
        oakSkills: {
          profiles: ['base', 'frontend'],
          bundle: 'owa',
          include: ['oak-gamma'],
          exclude: ['oak-beta'],
        },
      }),
    ).toEqual({
      profiles: ['base', 'frontend'],
      bundle: 'owa',
      include: ['oak-gamma'],
      exclude: ['oak-beta'],
    });
  });

  it('treats a null bundle as no bundle', () => {
    expect(
      readOakSkillsConfig({ oakSkills: { profiles: [], bundle: null } }).bundle,
    ).toBeUndefined();
  });

  it('explains how to add the settings when they are missing', () => {
    expect(() => readOakSkillsConfig({ name: 'x' })).toThrow(
      expect.objectContaining({
        message: 'package.json has no oakSkills settings.',
        hint: 'Run "oak-skills init" to add them.',
        exitCode: ExitCode.Configuration,
      }),
    );
  });

  it.each([
    ['not an object', ['base'], 'oakSkills in package.json: must be an object'],
    [
      'a profiles value that is not a list',
      { profiles: 'base' },
      'profiles must be a list of names',
    ],
    ['a list with a number in it', { profiles: ['base', 1] }, 'profiles must be a list of names'],
    [
      'a bundle that is not a string',
      { profiles: [], bundle: 3 },
      'bundle must be a repository code',
    ],
    [
      'an unknown setting',
      { profiles: [], profile: ['base'] },
      '"profile" isn\'t a setting oak-skills knows',
    ],
  ])('rejects %s', (_label, oakSkills, message) => {
    expect(() => readOakSkillsConfig({ oakSkills })).toThrow(message);
  });

  it('lists every problem at once', () => {
    expect(() => readOakSkillsConfig({ oakSkills: { profiles: 'base', include: 'x' } })).toThrow(
      'oakSkills in package.json has 2 problems:\n- profiles must be a list of names\n- include must be a list of names',
    );
  });
});

describe('resolveSkills', () => {
  it('gives the union of the subscribed profiles', () => {
    expect(names(config({ profiles: ['base', 'frontend'] }))).toEqual([
      'oak-alpha',
      'oak-beta',
      'oak-gamma',
    ]);
  });

  it('adds included shared skills', () => {
    expect(names(config({ include: ['oak-gamma'] }))).toEqual([
      'oak-alpha',
      'oak-beta',
      'oak-gamma',
    ]);
  });

  it('removes excluded skills', () => {
    expect(names(config({ exclude: ['oak-beta'] }))).toEqual(['oak-alpha']);
  });

  it('adds the whole bundle, with each skill source', () => {
    expect(
      resolveSkills(config({ bundle: 'owa', exclude: ['oak-beta'] }), catalogue).skills,
    ).toEqual([
      { name: 'oak-alpha', source: 'skills/central/oak-alpha' },
      { name: 'owa-routing', source: 'skills/repos/owa/owa-routing' },
    ]);
  });

  it('allows no profiles, giving only the bundle', () => {
    expect(names(config({ profiles: [], bundle: 'oc' }))).toEqual(['oc-tokens']);
  });

  it('warns when excluding a known skill that is not subscribed', () => {
    expect(resolveSkills(config({ exclude: ['oak-gamma'] }), catalogue)).toEqual({
      skills: [
        { name: 'oak-alpha', source: 'skills/central/oak-alpha' },
        { name: 'oak-beta', source: 'skills/central/oak-beta' },
      ],
      warnings: [
        'exclude lists "oak-gamma", but none of your profiles includes it, so it has no effect.',
      ],
    });
  });

  it.each([
    [
      'an unknown profile',
      config({ profiles: ['bse'] }),
      'unknown profile "bse". The profiles are "base", "frontend".',
    ],
    [
      'an unknown included skill',
      config({ include: ['oak-delta'] }),
      'include lists "oak-delta", which isn\'t a shared skill',
    ],
    [
      'an included bundle skill',
      config({ include: ['owa-routing'] }),
      'include lists "owa-routing", which isn\'t a shared skill',
    ],
    [
      'an unknown excluded skill',
      config({ exclude: ['oak-delta'] }),
      'exclude lists "oak-delta", which isn\'t a shared skill',
    ],
    [
      'a skill both included and excluded',
      config({ include: ['oak-gamma'], exclude: ['oak-gamma'] }),
      '"oak-gamma" is in both include and exclude',
    ],
    [
      'an unknown bundle',
      config({ bundle: 'xyz' }),
      'unknown bundle "xyz". The bundles are "oc", "owa".',
    ],
  ])('fails with the configuration exit code on %s', (_label, c, message) => {
    expect(() => resolveSkills(c, catalogue)).toThrow(message);
    expect(() => resolveSkills(c, catalogue)).toThrow(
      expect.objectContaining({ exitCode: ExitCode.Configuration }),
    );
  });

  it('says when the package has no bundles', () => {
    const noBundles = { ...catalogue, bundles: new Map<string, string[]>() };
    expect(() => resolveSkills(config({ bundle: 'owa' }), noBundles)).toThrow(
      'unknown bundle "owa". This version has no bundles.',
    );
  });

  it('reports every problem at once', () => {
    expect(() => resolveSkills(config({ profiles: ['nope'], bundle: 'xyz' }), catalogue)).toThrow(
      /has 2 problems:\n- unknown profile "nope".*\n- unknown bundle "xyz"/,
    );
  });
});
