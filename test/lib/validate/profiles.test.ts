import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { checkProfiles } from '../../../src/lib/validate/profiles.ts';
import { loadDevDependencies } from '../../../src/lib/validate/dev-dependencies.ts';
import { compileSchemas, type SchemaValidator } from '../../../src/lib/validate/schemas.ts';
import { makeTempDir, removeTree, writeTree } from '../../helpers/tree.ts';

let validateProfiles: SchemaValidator;
let root: string;
beforeAll(async () => {
  validateProfiles = compileSchemas(await loadDevDependencies()).profiles;
});
beforeEach(() => {
  root = makeTempDir('profiles');
});
afterEach(() => {
  removeTree(root);
});

function withProfiles(profiles: object | string) {
  writeTree(root, {
    'skills/profiles.json': typeof profiles === 'string' ? profiles : JSON.stringify(profiles),
  });
}

const base = (skills: string[]) => ({
  version: 1,
  profiles: { base: { description: 'Every repository', skills } },
});

describe('checkProfiles', () => {
  it('passes when every shared skill is in a profile and every listed skill exists', () => {
    withProfiles({
      version: 1,
      profiles: {
        base: { description: 'Every repository', skills: ['oak-a'] },
        frontend: { description: 'Interfaces', skills: ['oak-a', 'oak-b'] },
      },
    });
    const result = checkProfiles(root, ['oak-a', 'oak-b'], validateProfiles);
    expect(result.problems).toEqual([]);
    expect(Object.keys(result.profiles?.profiles ?? {})).toEqual(['base', 'frontend']);
  });

  it('fails a profile that lists a skill that does not exist, such as a typo', () => {
    withProfiles(base(['oak-a', 'oak-code-revue']));
    expect(checkProfiles(root, ['oak-a'], validateProfiles).problems).toEqual([
      {
        file: 'skills/profiles.json',
        message:
          'profile "base" lists oak-code-revue, which isn\'t a shared skill in skills/central/',
      },
    ]);
  });

  it('fails a shared skill that belongs to no profile', () => {
    withProfiles(base(['oak-a']));
    expect(checkProfiles(root, ['oak-a', 'oak-b'], validateProfiles).problems).toEqual([
      {
        file: 'skills/profiles.json',
        message: "doesn't list oak-b in any profile, so no repository could receive it",
      },
    ]);
  });

  it('allows no profiles.json while there are no shared skills', () => {
    expect(checkProfiles(root, [], validateProfiles)).toEqual({
      profiles: undefined,
      problems: [],
    });
  });

  it('fails a missing profiles.json once there are shared skills', () => {
    expect(checkProfiles(root, ['oak-a'], validateProfiles).problems).toEqual([
      {
        file: 'skills/profiles.json',
        message: "is missing, so the shared skills can't belong to a profile",
      },
    ]);
  });

  it('fails invalid JSON', () => {
    withProfiles('{ "version": 1,');
    const [problem] = checkProfiles(root, [], validateProfiles).problems;
    expect(problem?.message).toMatch(/^isn't valid JSON: /);
  });

  it('fails a file that breaks the schema', () => {
    withProfiles({ version: 1, profiles: { base: { skills: ['oak-a'] } } });
    expect(checkProfiles(root, ['oak-a'], validateProfiles)).toEqual({
      profiles: undefined,
      problems: [
        {
          file: 'skills/profiles.json',
          message: "/profiles/base must have required property 'description'",
        },
      ],
    });
  });
});
