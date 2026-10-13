// The package gate for publishing. It checks the tarball given, which the publish workflow
// passes in, or packs the working tree with pnpm, as Changesets does. Build first.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { checkCodeowners, checkPackage } from './publish-gates/package.ts';

const root = process.cwd();
const work = mkdtempSync(join(tmpdir(), 'oak-skills-package-'));
try {
  const tarball = process.argv[2] ?? join(work, 'package.tgz');
  if (process.argv[2] === undefined) {
    execFileSync('pnpm', ['pack', '--out', tarball], { cwd: root, stdio: 'ignore' });
  }
  execFileSync('tar', ['-xzf', tarball, '-C', work]);

  const packageDir = join(work, 'package');
  const files = readdirSync(packageDir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(packageDir, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
  const read = (path: string): string => readFileSync(join(packageDir, path), 'utf8');
  const problems = checkPackage({
    files,
    manifest: JSON.parse(read('package.json')) as Record<string, unknown>,
    read,
  });
  const codeowners = join(root, '.github/CODEOWNERS');
  if (existsSync(codeowners)) problems.push(...checkCodeowners(readFileSync(codeowners, 'utf8')));

  if (problems.length > 0) {
    for (const problem of problems) console.error(problem);
    console.error(
      `\nThe package isn't ready to publish: ${String(problems.length)} problem${problems.length === 1 ? '' : 's'}.`,
    );
    process.exitCode = 1;
  } else {
    console.log(`The package is ready to publish: ${String(files.length)} files, all expected.`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
