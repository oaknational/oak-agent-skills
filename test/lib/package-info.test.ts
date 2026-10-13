import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readPackageInfo } from '../../src/lib/package-info.ts';

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
    });
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
