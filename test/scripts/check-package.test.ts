import { execFileSync, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  checkCodeowners,
  checkPackage,
  REQUIRED_FILES,
  type PackedPackage,
} from '../../scripts/publish-gates/package.ts';
import { repoRoot } from '../helpers/paths.ts';
import { makeTempDir, removeTree, writeTree } from '../helpers/tree.ts';

const script = join(repoRoot, 'scripts/check-package.ts');

function packed(overrides: Partial<PackedPackage> = {}): PackedPackage {
  return {
    files: [...REQUIRED_FILES, 'README.md', 'LICENSE', 'skills/central/oak-example/SKILL.md'],
    manifest: { name: '@oaknational/oak-agent-skills', scripts: { build: 'tsc' } },
    read: () => 'Ordinary text.',
    ...overrides,
  };
}

describe('checkPackage', () => {
  it('passes a package with only the expected files', () => {
    expect(checkPackage(packed())).toEqual([]);
  });

  it('fails a file outside skills/, templates/ and dist/', () => {
    const files = [...packed().files, 'src/cli.ts', '.env'];
    expect(checkPackage(packed({ files }))).toEqual([
      'src/cli.ts would be published, but only skills/, templates/ and dist/ ship.',
      '.env would be published, but only skills/, templates/ and dist/ ship.',
    ]);
  });

  it('fails a package missing a file it needs', () => {
    const files = packed().files.filter((file) => file !== 'dist/cli.js');
    expect(checkPackage(packed({ files }))).toEqual(['dist/cli.js is missing from the package.']);
  });

  it.each(['preinstall', 'install', 'postinstall'])('fails a %s script', (name) => {
    const manifest = { scripts: { build: 'tsc', [name]: 'node evil.js' } };
    expect(checkPackage(packed({ manifest }))).toEqual([
      `package.json has a "${name}" script, which would run in every repository that installs the package.`,
    ]);
  });

  it('fails runtime dependencies', () => {
    const manifest = { dependencies: { yaml: '2.9.1' } };
    expect(checkPackage(packed({ manifest }))).toEqual([
      'package.json has runtime dependencies (yaml), but the package must have none.',
    ]);
  });

  it('passes an empty dependencies object', () => {
    expect(checkPackage(packed({ manifest: { dependencies: {} } }))).toEqual([]);
  });

  it('fails a placeholder in a packaged file', () => {
    const read = (path: string): string =>
      path === 'templates/AGENTS.md' ? 'Ask @oaknational/todo-engineers-team.' : 'Ordinary text.';
    expect(checkPackage(packed({ read }))).toEqual([
      'templates/AGENTS.md still contains the placeholder "todo-engineers-team".',
    ]);
  });
});

describe('checkCodeowners', () => {
  it('fails an owner line naming the placeholder team', () => {
    expect(checkCodeowners('/skills/central/ @oaknational/todo-engineers-team\n')).toEqual([
      '.github/CODEOWNERS still names the placeholder team "todo-engineers-team". Replace it with the real team.',
    ]);
  });

  it('ignores the placeholder in a comment', () => {
    expect(
      checkCodeowners(
        '# todo-engineers-team was a placeholder.\n/skills/central/ @oaknational/engineers\n',
      ),
    ).toEqual([]);
  });
});

describe('scripts/check-package.ts', () => {
  function run(files: Record<string, string>, codeowners?: string) {
    const dir = makeTempDir('check-package');
    try {
      writeTree(join(dir, 'tarball'), files);
      // npm and pnpm put everything under package/ in the tarball.
      execFileSync('tar', [
        '-czf',
        join(dir, 'package.tgz'),
        '-C',
        join(dir, 'tarball'),
        'package',
      ]);
      const repo = join(dir, 'repo');
      writeTree(repo, codeowners === undefined ? {} : { '.github/CODEOWNERS': codeowners });
      return spawnSync(process.execPath, [script, join(dir, 'package.tgz')], {
        cwd: repo,
        encoding: 'utf8',
      });
    } finally {
      removeTree(dir);
    }
  }

  const goodPackage = Object.fromEntries(
    REQUIRED_FILES.map((file) => [
      `package/${file}`,
      file === 'package.json' ? JSON.stringify({ name: 'x', scripts: {} }) : 'Ordinary text.',
    ]),
  );

  it('passes a tarball with only the expected files', () => {
    const result = run(goodPackage, '* @oaknational/skills-maintainers\n');
    expect(result.stdout).toBe(
      `The package is ready to publish: ${String(REQUIRED_FILES.length)} files, all expected.\n`,
    );
    expect(result.status).toBe(0);
  });

  it('fails a tarball with an install script, and CODEOWNERS with the placeholder', () => {
    const result = run(
      {
        ...goodPackage,
        'package/package.json': JSON.stringify({ name: 'x', scripts: { postinstall: 'x' } }),
        'package/docs/notes.md': 'Notes.',
      },
      '/skills/central/ @oaknational/todo-engineers-team\n',
    );
    expect(result.stderr).toBe(
      [
        'docs/notes.md would be published, but only skills/, templates/ and dist/ ship.',
        'package.json has a "postinstall" script, which would run in every repository that installs the package.',
        '.github/CODEOWNERS still names the placeholder team "todo-engineers-team". Replace it with the real team.',
        '',
        "The package isn't ready to publish: 3 problems.",
        '',
      ].join('\n'),
    );
    expect(result.status).toBe(1);
  });
});
