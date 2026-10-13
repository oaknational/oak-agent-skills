import { describe, expect, it } from 'vitest';
import { PACKAGE_DIR, readCatalogue } from '../../src/lib/catalogue.ts';
import { packageFixture, repoRoot } from '../helpers/paths.ts';
import { makeTempDir, removeTree, writeTree } from '../helpers/tree.ts';

describe('readCatalogue', () => {
  it("reads the package's profiles, shared skills and bundles", () => {
    const catalogue = readCatalogue(packageFixture);
    expect(catalogue.dir).toBe(packageFixture);
    expect(Object.fromEntries(catalogue.profiles)).toEqual({
      base: ['oak-alpha', 'oak-beta'],
      frontend: ['oak-gamma'],
    });
    expect([...catalogue.shared]).toEqual(['oak-alpha', 'oak-beta', 'oak-gamma']);
    expect(Object.fromEntries(catalogue.bundles)).toEqual({
      oc: ['oc-tokens'],
      owa: ['owa-routing'],
    });
  });

  it('defaults to the folder the tool is installed in', () => {
    expect(PACKAGE_DIR).toBe(repoRoot);
  });

  it('copes with a package that has no skills folders or profile skills', () => {
    const dir = makeTempDir('catalogue');
    try {
      writeTree(dir, { 'skills/profiles.json': '{"version":1,"profiles":{"empty":{}}}' });
      const catalogue = readCatalogue(dir);
      expect(Object.fromEntries(catalogue.profiles)).toEqual({ empty: [] });
      expect(catalogue.shared.size).toBe(0);
      expect(catalogue.bundles.size).toBe(0);
    } finally {
      removeTree(dir);
    }
  });

  it('copes with a profiles.json that has no profiles', () => {
    const dir = makeTempDir('catalogue');
    try {
      writeTree(dir, { 'skills/profiles.json': '{"version":1}' });
      expect(readCatalogue(dir).profiles.size).toBe(0);
    } finally {
      removeTree(dir);
    }
  });

  it('explains when the package has no profiles.json', () => {
    const dir = makeTempDir('catalogue');
    try {
      expect(() => readCatalogue(dir)).toThrow('The installed package has no skills/profiles.json');
    } finally {
      removeTree(dir);
    }
  });
});
