import { symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listFolder } from '../../src/lib/files.ts';
import { makeTempDir, removeTree, writeTree } from '../helpers/tree.ts';

describe('listFolder', () => {
  it('lists files and folders recursively, sorted, and sets symlinks apart', () => {
    const root = makeTempDir('files');
    try {
      writeTree(root, { 'b.md': '', 'a/z.md': '', 'a/deep/y.md': '' });
      symlinkSync('b.md', join(root, 'link.md'));
      expect(listFolder(root)).toEqual({
        files: ['a/deep/y.md', 'a/z.md', 'b.md'],
        folders: ['a', 'a/deep'],
        others: ['link.md'],
      });
    } finally {
      removeTree(root);
    }
  });
});
