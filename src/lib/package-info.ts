import { readFileSync } from 'node:fs';

// The tool ships inside the package, so its own package.json sits two folders up,
// both in src/lib when testing and in dist/lib once built.
const packageJsonUrl = new URL('../../package.json', import.meta.url);

export interface PackageInfo {
  name: string;
  version: string;
}

export function readPackageInfo(url: URL = packageJsonUrl): PackageInfo {
  const parsed: unknown = JSON.parse(readFileSync(url, 'utf8'));
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    !('name' in parsed) ||
    !('version' in parsed) ||
    typeof parsed.name !== 'string' ||
    typeof parsed.version !== 'string'
  ) {
    throw new Error(`${url.pathname} has no name or version`);
  }
  return { name: parsed.name, version: parsed.version };
}
