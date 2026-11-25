import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readPackageInfo, satisfiesRange } from '../../src/lib/package-info.ts';

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function packageFile(contents: string): URL {
  const dir = mkdtempSync(join(tmpdir(), 'oak-skills-package-info-'));
  dirs.push(dir);
  const file = join(dir, 'package.json');
  writeFileSync(file, contents);
  return pathToFileURL(file);
}

describe('readPackageInfo', () => {
  it("reads the tool's own package.json by default", () => {
    const info = readPackageInfo();
    expect(info.name).toBe('@oaknational/oak-agent-skills');
    expect(info.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('reads the name and version from a given file', () => {
    expect(readPackageInfo(packageFile('{"name":"x","version":"1.2.3"}'))).toEqual({
      name: 'x',
      version: '1.2.3',
      nodeRange: undefined,
    });
  });

  it('reads the supported Node versions from engines', () => {
    expect(
      readPackageInfo(packageFile('{"name":"x","version":"1.2.3","engines":{"node":">=24 <25"}}'))
        .nodeRange,
    ).toBe('>=24 <25');
    expect(readPackageInfo().nodeRange).toMatch(/^>=24/);
  });

  it.each([
    ['a missing version', '{"name":"x"}'],
    ['a missing name', '{"version":"1.0.0"}'],
    ['a non-string version', '{"name":"x","version":1}'],
    ['a non-string name', '{"name":1,"version":"1.0.0"}'],
    ['a non-object', '"just a string"'],
    ['null', 'null'],
  ])('throws on %s', (_label, contents) => {
    expect(() => readPackageInfo(packageFile(contents))).toThrow(/has no name or version/);
  });

  it('throws on invalid JSON', () => {
    expect(() => readPackageInfo(packageFile('{'))).toThrow(SyntaxError);
  });
});

describe('satisfiesRange', () => {
  it.each([
    ['24.22.1', '>=24.22.1 <25', true],
    ['24.30.0', '>=24.22.1 <25', true],
    ['24.21.9', '>=24.22.1 <25', false],
    ['25.0.0', '>=24.22.1 <25', false],
    ['v24.22.1', '>=24.22.1 <25', true],
    ['24.0.0', '>24', false],
    ['24.0.1', '>24', true],
    ['24.0.0', '<=24', true],
    ['24.0.0', '=24.0.0', true],
    ['24.0.0', '24.0.1', false],
    ['20.0.0', '^24 || ^26', true],
  ])('Node %s against %s is %s', (version, range, expected) => {
    expect(satisfiesRange(version, range)).toBe(expected);
  });
});
