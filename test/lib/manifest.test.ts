import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ExitCode } from '../../src/lib/exit-codes.ts';
import {
  MANIFEST_PATH,
  readManifest,
  serialiseManifest,
  writeManifest,
  type Manifest,
} from '../../src/lib/manifest.ts';
import { loadDevDependencies } from '../../src/lib/validate/dev-dependencies.ts';
import { compileSchemas } from '../../src/lib/validate/schemas.ts';
import { makeTempDir, removeTree, writeTree } from '../helpers/tree.ts';

const SUM = (digit: string) => digit.repeat(64);

const manifest: Manifest = {
  manifestVersion: 1,
  package: { name: '@oaknational/oak-agent-skills', version: '1.2.3' },
  config: { profiles: ['base'], bundle: 'owa', include: [], exclude: ['oak-beta'] },
  skills: {
    'owa-routing': { source: 'skills/repos/owa/owa-routing', files: { 'SKILL.md': SUM('2') } },
    'oak-alpha': {
      source: 'skills/central/oak-alpha',
      files: { 'references/guide.md': SUM('1'), 'SKILL.md': SUM('0') },
    },
  },
  symlinks: [
    { path: '.claude/skills/owa-routing', target: '../../.agents/skills/owa-routing' },
    { path: '.claude/skills/oak-alpha', target: '../../.agents/skills/oak-alpha' },
  ],
};

let root: string;
beforeEach(() => {
  root = makeTempDir('manifest');
});
afterEach(() => {
  removeTree(root);
});

describe('the manifest', () => {
  it('reads back what was written, with its links sorted', () => {
    writeManifest(root, manifest);
    expect(readManifest(root)).toEqual({ ...manifest, symlinks: [...manifest.symlinks].reverse() });
  });

  it('writes keys and links in a stable order, so the same sync writes the same bytes', () => {
    const shuffled: Manifest = {
      ...manifest,
      skills: Object.fromEntries(Object.entries(manifest.skills).reverse()),
      symlinks: [...manifest.symlinks].reverse(),
    };
    expect(serialiseManifest(shuffled)).toBe(serialiseManifest(manifest));
    const text = serialiseManifest(manifest);
    expect(text.indexOf('oak-alpha')).toBeLessThan(text.indexOf('owa-routing'));
    expect(text.indexOf('SKILL.md')).toBeLessThan(text.indexOf('references/guide.md'));
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('matches schema/manifest.schema.json', async () => {
    const validators = compileSchemas(await loadDevDependencies());
    expect(validators.manifest(JSON.parse(serialiseManifest(manifest)))).toEqual([]);
  });

  it('is undefined when there is no manifest yet', () => {
    expect(readManifest(root)).toBeUndefined();
  });

  it('fails with the configuration exit code when the manifest is not JSON', () => {
    writeTree(root, { [MANIFEST_PATH]: '{' });
    expect(() => readManifest(root)).toThrow(
      expect.objectContaining({
        exitCode: ExitCode.Configuration,
        hint: expect.stringContaining('oak-skills sync') as unknown,
      }),
    );
  });

  it.each([
    ['another version', { ...manifest, manifestVersion: 2 }],
    ['no package version', { ...manifest, package: { name: 'x' } }],
    ['a bad bundle', { ...manifest, config: { ...manifest.config, bundle: 3 } }],
    [
      'profiles that are not a list',
      { ...manifest, config: { ...manifest.config, profiles: 'base' } },
    ],
    ['a skill without files', { ...manifest, skills: { x: { source: 'skills/central/x' } } }],
    [
      'a checksum that is not a string',
      { ...manifest, skills: { x: { source: 's', files: { a: 1 } } } },
    ],
    ['symlinks that are not a list', { ...manifest, symlinks: {} }],
    ['a symlink without a target', { ...manifest, symlinks: [{ path: '.claude/skills/x' }] }],
    ['a list instead of an object', []],
  ])('rejects a manifest with %s', (_label, bad) => {
    writeTree(root, { [MANIFEST_PATH]: JSON.stringify(bad) });
    expect(() => readManifest(root)).toThrow(
      `${MANIFEST_PATH} isn't a manifest oak-skills recognises.`,
    );
  });

  it('creates the skills folder if needed', () => {
    writeManifest(root, manifest);
    expect(readFileSync(join(root, MANIFEST_PATH), 'utf8')).toBe(serialiseManifest(manifest));
  });
});
