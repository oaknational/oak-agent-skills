import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { loadDevDependencies } from '../../../src/lib/validate/dev-dependencies.ts';
import {
  compileSchemas,
  readSchema,
  type SchemaName,
  type SchemaValidator,
} from '../../../src/lib/validate/schemas.ts';
import { fixturesDir } from '../../helpers/paths.ts';

let validators: Record<SchemaName, SchemaValidator>;
beforeAll(async () => {
  validators = compileSchemas(await loadDevDependencies());
});

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(`${fixturesDir}/schema/${name}`, 'utf8'));

const validFrontmatter = {
  name: 'oak-code-review',
  description: 'Reviews a diff for correctness, design, risk and test coverage.',
  license: 'MIT',
  metadata: { owner: '@oaknational/skills-maintainers', updated: '2026-10-13' },
};

function withChange(change: (copy: Record<string, unknown>) => void): unknown {
  const copy = structuredClone(validFrontmatter) as unknown as Record<string, unknown>;
  change(copy);
  return copy;
}

const metadata = (copy: Record<string, unknown>) => copy.metadata as Record<string, unknown>;

describe('frontmatter schema', () => {
  it('accepts the required fields', () => {
    expect(validators.frontmatter(validFrontmatter)).toEqual([]);
  });

  it('accepts every optional field', () => {
    const full = withChange((copy) => {
      copy.compatibility = 'Needs git';
      metadata(copy).deprecated = 'oak-review';
      metadata(copy).source = 'oaknational/oak-ai-plugins@2a43cf1';
    });
    expect(validators.frontmatter(full)).toEqual([]);
  });

  it.each([
    [
      'an allowed-tools field',
      (c: Record<string, unknown>) => (c['allowed-tools'] = 'Bash'),
      'allowed-tools',
    ],
    [
      'a double hyphen in the name',
      (c: Record<string, unknown>) => (c.name = 'oak--review'),
      'single hyphens',
    ],
    [
      'a name starting with a hyphen',
      (c: Record<string, unknown>) => (c.name = '-oak'),
      'single hyphens',
    ],
    [
      'a name ending with a hyphen',
      (c: Record<string, unknown>) => (c.name = 'oak-'),
      'single hyphens',
    ],
    [
      'an uppercase name',
      (c: Record<string, unknown>) => (c.name = 'Oak-Review'),
      'single hyphens',
    ],
    [
      'a 65-character name',
      (c: Record<string, unknown>) => (c.name = 'a'.repeat(65)),
      'more than 64',
    ],
    ['an empty description', (c: Record<string, unknown>) => (c.description = ''), 'fewer than 1'],
    [
      'a 1,025-character description',
      (c: Record<string, unknown>) => (c.description = 'a'.repeat(1025)),
      'more than 1024',
    ],
    [
      'a 501-character compatibility',
      (c: Record<string, unknown>) => (c.compatibility = 'a'.repeat(501)),
      'more than 500',
    ],
    ['no licence', (c: Record<string, unknown>) => delete c.license, "required property 'license'"],
    [
      'no metadata',
      (c: Record<string, unknown>) => delete c.metadata,
      "required property 'metadata'",
    ],
    [
      'no metadata.updated',
      (c: Record<string, unknown>) => delete metadata(c).updated,
      "required property 'updated'",
    ],
    [
      'no metadata.owner',
      (c: Record<string, unknown>) => delete metadata(c).owner,
      "required property 'owner'",
    ],
    [
      'an owner that is not a team',
      (c: Record<string, unknown>) => (metadata(c).owner = 'someone'),
      'GitHub team',
    ],
    [
      'an updated date in the wrong format',
      (c: Record<string, unknown>) => (metadata(c).updated = '13/10/2026'),
      'YYYY-MM-DD',
    ],
    [
      'a non-string metadata value',
      (c: Record<string, unknown>) => (metadata(c).updated = 20261013),
      'must be string',
    ],
    [
      'an unknown metadata field',
      (c: Record<string, unknown>) => (metadata(c).author = 'x'),
      'author',
    ],
    [
      'a source without a commit',
      (c: Record<string, unknown>) => (metadata(c).source = 'oaknational/oak-ai-plugins'),
      'owner/repository@commit',
    ],
    [
      'a deprecated value that is not a skill name',
      (c: Record<string, unknown>) => (metadata(c).deprecated = 'Not A Skill'),
      'replaces this one',
    ],
  ])('rejects %s', (_label, change, message) => {
    const problems = validators.frontmatter(withChange(change));
    expect(problems.length).toBeGreaterThan(0);
    expect(problems.map((p) => p.message).join('\n')).toContain(message);
  });

  it('rejects something that is not an object', () => {
    expect(validators.frontmatter('just text')).toEqual([
      { path: '(top level)', message: 'must be object' },
    ]);
  });
});

describe('profiles schema', () => {
  it('accepts the example from ADR 0001', () => {
    expect(validators.profiles(fixture('profiles.valid.json'))).toEqual([]);
  });

  it('rejects a bad version, profile name, missing description, unprefixed or repeated skills', () => {
    const messages = validators
      .profiles(fixture('profiles.invalid.json'))
      .map((p) => `${p.path} ${p.message}`);
    expect(messages).toEqual(
      expect.arrayContaining([
        '/version must be equal to constant',
        expect.stringMatching(/property name must be valid|must match pattern/),
        "/profiles/Base must have required property 'description'",
        expect.stringContaining('/profiles/Base/skills/0'),
        expect.stringContaining('must NOT have duplicate items'),
      ]),
    );
  });
});

describe('manifest schema', () => {
  it('accepts a manifest with a shared skill and a bundle skill', () => {
    expect(validators.manifest(fixture('manifest.valid.json'))).toEqual([]);
  });

  it('rejects another package, a source outside skills/, a bad checksum and a link that escapes', () => {
    const paths = validators.manifest(fixture('manifest.invalid.json')).map((p) => p.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        '/package/name',
        '/skills/oak-code-review/source',
        '/skills/oak-code-review/files/SKILL.md',
        '/symlinks/0/target',
      ]),
    );
  });
});

describe('readSchema', () => {
  it.each<SchemaName>(['frontmatter', 'profiles', 'manifest'])(
    'reads %s with its own $id',
    (name) => {
      expect(readSchema(name)).toMatchObject({
        $id: expect.stringContaining(`${name}.schema.json`) as unknown,
      });
    },
  );
});
