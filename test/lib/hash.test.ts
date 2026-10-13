import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { hashFile, hashFolder, sha256 } from '../../src/lib/hash.ts';
import { makeTempDir, removeTree, writeTree } from '../helpers/tree.ts';

// echo -n hello | shasum -a 256
const HELLO = '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824';

describe('hashing', () => {
  it('hashes text and files with SHA-256', () => {
    expect(sha256('hello')).toBe(HELLO);
    const dir = makeTempDir('hash');
    try {
      writeTree(dir, { 'a.txt': 'hello' });
      expect(hashFile(join(dir, 'a.txt'))).toBe(HELLO);
    } finally {
      removeTree(dir);
    }
  });

  it('hashes every ordinary file in a folder, ignoring symlinks', () => {
    const dir = makeTempDir('hash');
    try {
      writeTree(dir, { 'SKILL.md': 'hello', 'references/a.md': '' });
      symlinkSync('SKILL.md', join(dir, 'link.md'));
      expect(hashFolder(dir)).toEqual({
        'SKILL.md': HELLO,
        'references/a.md': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });
    } finally {
      removeTree(dir);
    }
  });
});
