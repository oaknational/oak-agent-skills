import { describe, expect, it } from 'vitest';
import { OakSkillsError } from '../../../src/lib/errors.ts';
import { loadDevDependencies } from '../../../src/lib/validate/dev-dependencies.ts';

function notFound(): Error {
  return Object.assign(new Error("Cannot find package 'yaml'"), { code: 'ERR_MODULE_NOT_FOUND' });
}

describe('loadDevDependencies', () => {
  it('loads ajv and yaml from the dev dependencies', async () => {
    const { Ajv, yaml } = await loadDevDependencies();
    expect(new Ajv().compile({ type: 'string' })('x')).toBe(true);
    expect(yaml.parse('a: 1')).toEqual({ a: 1 });
  });

  it('explains that validate only runs in the central repository when they are missing', async () => {
    const promise = loadDevDependencies(() => Promise.reject(notFound()));
    await expect(promise).rejects.toBeInstanceOf(OakSkillsError);
    await expect(promise).rejects.toThrow('only runs in the central oak-agent-skills repository');
  });

  it('rethrows any other failure', async () => {
    await expect(
      loadDevDependencies(() => Promise.reject(new Error('disk on fire'))),
    ).rejects.toThrow('disk on fire');
  });
});
