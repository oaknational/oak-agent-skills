import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { listFolder } from './files.ts';

export function sha256(contents: string | Buffer): string {
  return createHash('sha256').update(contents).digest('hex');
}

export function hashFile(path: string): string {
  return sha256(readFileSync(path));
}

// Checksums for every ordinary file in a folder, keyed by path relative to it.
export function hashFolder(dir: string): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const file of listFolder(dir).files) hashes[file] = hashFile(join(dir, file));
  return hashes;
}
