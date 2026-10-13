import { cpSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { packageFixture, repoRoot } from './paths.ts';
import { makeTempDir } from './tree.ts';

export function setOakSkills(root: string, oakSkills: unknown): void {
  const file = join(root, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  pkg.oakSkills = oakSkills;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

// A copy of the stand-in package that a test can change, such as to publish a new version.
export function copyPackage(): string {
  const dir = makeTempDir('package');
  cpSync(packageFixture, dir, { recursive: true });
  return dir;
}

export function setPackageVersion(dir: string, version: string): void {
  const file = join(dir, 'package.json');
  const pkg = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  pkg.version = version;
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

// A copy of the stand-in package with the real templates, for init.
export function packageWithTemplates(): string {
  const dir = copyPackage();
  cpSync(join(repoRoot, 'templates'), join(dir, 'templates'), { recursive: true });
  return dir;
}
