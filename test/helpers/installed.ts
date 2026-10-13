import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageFixture, repoRoot } from './paths.ts';

export const INSTALLED_DIR = 'node_modules/@oaknational/oak-agent-skills';

// Lays out the package as an install would: the built tool, with the stand-in package's
// skills and version beside it, so the tool finds its skills next to its own code.
export function installPackage(root: string, packageDir: string = packageFixture): string {
  const installed = join(root, INSTALLED_DIR);
  mkdirSync(installed, { recursive: true });
  cpSync(join(packageDir, 'package.json'), join(installed, 'package.json'));
  cpSync(join(packageDir, 'skills'), join(installed, 'skills'), { recursive: true });
  cpSync(join(repoRoot, 'dist'), join(installed, 'dist'), { recursive: true });
  writeFileSync(join(root, '.gitignore'), 'node_modules/\n');
  return join(installed, 'dist/cli.js');
}

export function runInstalled(cli: string, cwd: string, ...args: string[]) {
  const result = spawnSync(process.execPath, [cli, ...args], { cwd, encoding: 'utf8' });
  return { code: result.status, out: result.stdout, err: result.stderr };
}
