import { mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { SkillLocation } from '../../../src/lib/validate/central-repo.ts';
import {
  loadDevDependencies,
  type DevDependencies,
} from '../../../src/lib/validate/dev-dependencies.ts';
import { compileSchemas, type SchemaValidator } from '../../../src/lib/validate/schemas.ts';
import { checkSkill, MAX_BODY_LINES } from '../../../src/lib/validate/skill-checks.ts';
import {
  makeTempDir,
  removeTree,
  skillText,
  writeTree,
  type SkillOptions,
} from '../../helpers/tree.ts';

let deps: DevDependencies;
let validateFrontmatter: SchemaValidator;
let root: string;

beforeAll(async () => {
  deps = await loadDevDependencies();
  validateFrontmatter = compileSchemas(deps).frontmatter;
});
beforeEach(() => {
  root = makeTempDir('skill-checks');
});
afterEach(() => {
  removeTree(root);
});

function location(name: string, bundle?: string): SkillLocation {
  return {
    name,
    bundle,
    path: bundle === undefined ? `skills/central/${name}` : `skills/repos/${bundle}/${name}`,
  };
}

function check(loc: SkillLocation, files: Record<string, string>) {
  writeTree(join(root, loc.path), files);
  return checkSkill(root, loc, deps, validateFrontmatter);
}

function messages(loc: SkillLocation, files: Record<string, string>): string[] {
  return check(loc, files).problems.map((p) => `${p.file}: ${p.message}`);
}

const skill = (options: SkillOptions = {}) => skillText(options);

describe('a valid skill', () => {
  it('has no problems and returns its frontmatter', () => {
    const result = check(location('oak-example'), {
      'SKILL.md': skill({ body: '# Example\n\nSee [the guide](references/guide.md).' }),
      'references/guide.md': '# Guide\n',
    });
    expect(result.problems).toEqual([]);
    expect(result.frontmatter).toMatchObject({ name: 'oak-example', license: 'MIT' });
  });

  it('copes with Windows line endings', () => {
    const result = check(location('oak-example'), { 'SKILL.md': skill().replace(/\n/g, '\r\n') });
    expect(result.problems).toEqual([]);
  });
});

describe('names and prefixes', () => {
  it('requires the folder name to match the name', () => {
    expect(messages(location('oak-example'), { 'SKILL.md': skill({ name: 'oak-other' }) })).toEqual(
      [
        'skills/central/oak-example/SKILL.md: is named "oak-other", but its folder is "oak-example". They must match.',
      ],
    );
  });

  it('requires shared skills to start with oak-', () => {
    expect(
      messages(location('code-review'), { 'SKILL.md': skill({ name: 'code-review' }) }),
    ).toEqual([
      'skills/central/code-review: is a shared skill, so its name must start with "oak-"',
    ]);
  });

  it('accepts a bundle skill with its repository code', () => {
    expect(
      messages(location('owa-routing', 'owa'), { 'SKILL.md': skill({ name: 'owa-routing' }) }),
    ).toEqual([]);
  });

  it('requires bundle skills to start with their repository code', () => {
    expect(
      messages(location('oak-routing', 'owa'), { 'SKILL.md': skill({ name: 'oak-routing' }) }),
    ).toEqual([
      'skills/repos/owa/oak-routing: is in the owa bundle, so its name must start with "owa-"',
    ]);
  });

  it.each(['synced', 'Synced', 'anthropic-skills'])(
    'rejects the name %s, which Claude Code reserves',
    (name) => {
      expect(messages(location(name), { 'SKILL.md': skill({ name }) })).toContain(
        `skills/central/${name}: uses the name "${name}", which Claude Code reserves`,
      );
    },
  );
});

describe('body length', () => {
  const body = (lines: number) =>
    Array.from({ length: lines }, (_, i) => `Line ${String(i + 1)}`).join('\n');

  it(`accepts a body of ${String(MAX_BODY_LINES - 1)} lines`, () => {
    expect(
      messages(location('oak-example'), { 'SKILL.md': skill({ body: body(MAX_BODY_LINES - 2) }) }),
    ).toEqual([]);
  });

  it(`rejects a body of ${String(MAX_BODY_LINES)} lines`, () => {
    expect(
      messages(location('oak-example'), { 'SKILL.md': skill({ body: body(MAX_BODY_LINES - 1) }) }),
    ).toEqual([
      `skills/central/oak-example/SKILL.md: has a body of ${String(MAX_BODY_LINES)} lines. Keep it under ${String(MAX_BODY_LINES)}, with detail in references/.`,
    ]);
  });
});

describe('file references', () => {
  const withBody = (body: string, extra: Record<string, string> = {}) =>
    messages(location('oak-example'), { 'SKILL.md': skill({ body }), ...extra });

  it('accepts links to files and folders that exist, and ignores external links and anchors', () => {
    expect(
      withBody(
        [
          '[guide](references/guide.md#part) [folder](references/) [space](references/my%20notes.md)',
          '[site](https://example.com) [mail](mailto:x@example.com) [anchor](#top) ![img](assets/a.png)',
          '[ref]: references/guide.md',
          'See `references/guide.md` and `scripts/run.sh`.',
        ].join('\n'),
        {
          'references/guide.md': '# Guide\n',
          'references/my notes.md': '# Notes\n',
          'assets/a.png': 'png',
          'scripts/run.sh': 'echo hi',
        },
      ),
    ).toEqual([]);
  });

  it('rejects a link to a missing file', () => {
    expect(withBody('Read [this](references/missing.md).')).toEqual([
      "skills/central/oak-example/SKILL.md:10: refers to references/missing.md, which doesn't exist",
    ]);
  });

  it('rejects a reference-style link to a missing file', () => {
    expect(withBody('[guide]: references/missing.md')).toEqual([
      "skills/central/oak-example/SKILL.md:10: refers to references/missing.md, which doesn't exist",
    ]);
  });

  it('rejects a path in code that does not exist', () => {
    expect(withBody('See `references/missing.md`.')).toEqual([
      "skills/central/oak-example/SKILL.md:10: refers to references/missing.md, which doesn't exist",
    ]);
  });

  it.each(['../oak-other/SKILL.md', '/etc/passwd'])(
    'rejects a link outside the skill: %s',
    (target) => {
      expect(withBody(`Read [this](${target}).`)).toEqual([
        `skills/central/oak-example/SKILL.md:10: refers to ${target}, which is outside the skill. A synced skill only has its own files.`,
      ]);
    },
  );

  it('ignores links inside code blocks', () => {
    expect(withBody('```markdown\n[example](references/missing.md)\n```')).toEqual([]);
  });

  it('checks links in reference files relative to that file', () => {
    expect(
      withBody('Read [the guide](references/guide.md).', {
        'references/guide.md': '[back](../SKILL.md) [missing](./other.md)',
      }),
    ).toEqual([
      "skills/central/oak-example/references/guide.md:1: refers to ./other.md, which doesn't exist",
    ]);
  });

  it('accepts a target that only looks percent-encoded', () => {
    expect(withBody('[odd](references/100%.md)', { 'references/100%.md': 'x' })).toEqual([]);
  });
});

describe('shell commands Claude Code would run', () => {
  const withBody = (body: string) =>
    messages(location('oak-example'), { 'SKILL.md': skill({ body }) });

  it.each([
    ['at the start of a line', '!`git status`'],
    ['after whitespace', 'Run !`git status` now.'],
  ])('rejects the inline form %s', (_label, line) => {
    expect(withBody(line)).toEqual([
      'skills/central/oak-example/SKILL.md:10: uses the !`command` syntax, which Claude Code runs as a shell command before the skill reaches the model',
    ]);
  });

  it.each(['```!', '~~~!', '  ````!'])('rejects a code block opened with %s', (fence) => {
    expect(withBody(`${fence}\ngit status\n\`\`\``)).toContain(
      'skills/central/oak-example/SKILL.md:10: opens a code block with "!", which Claude Code runs as a shell command before the skill reaches the model',
    );
  });

  it('accepts ! after another character, and ordinary code blocks', () => {
    expect(
      withBody('KEY=!`cmd` is literal text.\n\n```bash\ngit status\n```\n\nUse `!` for negation.'),
    ).toEqual([]);
  });
});

describe('folder contents', () => {
  it('rejects a .claude-plugin folder anywhere in the skill', () => {
    expect(
      messages(location('oak-example'), {
        'SKILL.md': skill(),
        'extra/.claude-plugin/plugin.json': '{}',
      }),
    ).toEqual([
      'skills/central/oak-example/extra/.claude-plugin: would make Claude Code load the skill as a plugin. Skills must not contain .claude-plugin/.',
    ]);
  });

  it('rejects an empty .claude-plugin folder', () => {
    const loc = location('oak-example');
    writeTree(join(root, loc.path), { 'SKILL.md': skill() });
    mkdirSync(join(root, loc.path, '.claude-plugin'));
    expect(checkSkill(root, loc, deps, validateFrontmatter).problems.map((p) => p.file)).toEqual([
      'skills/central/oak-example/.claude-plugin',
    ]);
  });

  it('rejects a symlink', () => {
    const loc = location('oak-example');
    writeTree(join(root, loc.path), { 'SKILL.md': skill() });
    symlinkSync('/etc/hosts', join(root, loc.path, 'hosts'));
    expect(checkSkill(root, loc, deps, validateFrontmatter).problems).toEqual([
      {
        file: 'skills/central/oak-example/hosts',
        message: 'is a symlink or special file. Skills may hold only ordinary files and folders.',
      },
    ]);
  });

  it('requires a SKILL.md', () => {
    const result = check(location('oak-example'), { 'README.md': '# Hi\n' });
    expect(result.frontmatter).toBeUndefined();
    expect(result.problems.map((p) => p.message)).toEqual(['has no SKILL.md']);
  });
});

describe('frontmatter', () => {
  it.each([
    ['no frontmatter', '# Just a heading\n'],
    ['unclosed frontmatter', '---\nname: oak-example\n\n# Heading\n'],
  ])('rejects %s', (_label, text) => {
    expect(messages(location('oak-example'), { 'SKILL.md': text })).toEqual([
      'skills/central/oak-example/SKILL.md: must start with YAML frontmatter between two --- lines',
    ]);
  });

  it('rejects YAML that does not parse', () => {
    const result = messages(location('oak-example'), { 'SKILL.md': '---\nname: [oak\n---\n# x\n' });
    expect(result).toHaveLength(1);
    expect(result[0]).toMatch(
      /^skills\/central\/oak-example\/SKILL.md: has frontmatter that isn't valid YAML: /,
    );
  });

  it('rejects a repeated key', () => {
    expect(
      messages(location('oak-example'), {
        'SKILL.md': skill({ extraFrontmatter: 'license: Apache-2.0' }),
      })[0],
    ).toMatch(/isn't valid YAML: Map keys must be unique/);
  });

  it('reports schema problems, such as allowed-tools', () => {
    const result = check(location('oak-example'), {
      'SKILL.md': skill({ extraFrontmatter: 'allowed-tools: Bash' }),
    });
    expect(result.frontmatter).toBeUndefined();
    expect(result.problems.map((p) => p.message)).toEqual([
      "frontmatter (top level) has a field that isn't allowed: allowed-tools",
    ]);
  });

  it.each(['2026-02-30', '2026-13-01'])(
    'rejects metadata.updated %s, which is not a real date',
    (date) => {
      expect(
        messages(location('oak-example'), {
          'SKILL.md': skill({
            metadata: `  owner: '@oaknational/skills-maintainers'\n  updated: '${date}'`,
          }),
        }),
      ).toEqual([
        `skills/central/oak-example/SKILL.md: has metadata.updated "${date}", which isn't a real date`,
      ]);
    },
  );
});
