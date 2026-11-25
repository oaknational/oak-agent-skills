import { readFileSync } from 'node:fs';

// The tool ships inside the package, so its own package.json sits two folders up,
// both in src/lib when testing and in dist/lib once built.
const packageJsonUrl = new URL('../../package.json', import.meta.url);

export interface PackageInfo {
  name: string;
  version: string;
  nodeRange: string | undefined;
}

const parseVersion = (version: string) =>
  version
    .replace(/^v/, '')
    .split('.')
    .map((part) => Number.parseInt(part, 10));

function compareVersions(a: string, b: string): number {
  const [left, right] = [parseVersion(a), parseVersion(b)];
  for (let index = 0; index < 3; index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

export function satisfiesRange(version: string, range: string): boolean {
  return range
    .trim()
    .split(/\s+/)
    .every((comparator) => {
      const match = /^(>=|<=|>|<|=)?v?(\d+(?:\.\d+){0,2})$/.exec(comparator);
      if (match?.[2] === undefined) return true;
      const difference = compareVersions(version, match[2]);
      switch (match[1]) {
        case '>=':
          return difference >= 0;
        case '>':
          return difference > 0;
        case '<=':
          return difference <= 0;
        case '<':
          return difference < 0;
        default:
          return difference === 0;
      }
    });
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
  const engines = 'engines' in parsed ? parsed.engines : undefined;
  const node =
    typeof engines === 'object' && engines !== null && 'node' in engines ? engines.node : undefined;
  return {
    name: parsed.name,
    version: parsed.version,
    nodeRange: typeof node === 'string' ? node : undefined,
  };
}
