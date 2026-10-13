import { readdirSync } from 'node:fs';
import { join } from 'node:path';

export interface FolderContents {
  // Paths relative to the folder, with forward slashes, sorted.
  files: string[];
  folders: string[];
  // Anything that isn't an ordinary file or folder, such as a symlink.
  others: string[];
}

export function listFolder(root: string): FolderContents {
  const files: string[] = [];
  const folders: string[] = [];
  const others: string[] = [];
  const walk = (relative: string): void => {
    for (const entry of readdirSync(join(root, relative), { withFileTypes: true })) {
      const path = relative === '' ? entry.name : `${relative}/${entry.name}`;
      if (entry.isDirectory()) {
        folders.push(path);
        walk(path);
      } else if (entry.isFile()) files.push(path);
      else others.push(path);
    }
  };
  walk('');
  return { files: files.sort(), folders: folders.sort(), others: others.sort() };
}
