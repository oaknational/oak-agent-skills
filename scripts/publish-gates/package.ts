// What a published version must look like. A version can never be withdrawn, so the publish
// workflow checks the tarball itself before publishing it.

export const ALLOWED_FOLDERS = ['skills/', 'templates/', 'dist/'];
// npm always includes these, whatever package.json's files lists.
export const ALWAYS_INCLUDED = ['package.json', 'README.md', 'CHANGELOG.md', 'LICENSE'];
export const REQUIRED_FILES = [
  'package.json',
  'dist/cli.js',
  'skills/profiles.json',
  'templates/AGENTS.md',
  'templates/workflows/oak-skills-sync.yml',
];
const INSTALL_SCRIPTS = ['preinstall', 'install', 'postinstall'];
// Values that stand in for something real until it exists, and must never be released.
export const PLACEHOLDERS = ['todo-engineers-team'];

export interface PackedPackage {
  // Paths inside the tarball's package/ folder, with forward slashes.
  files: string[];
  // The package.json that would be published.
  manifest: Record<string, unknown>;
  read: (path: string) => string;
}

export function checkPackage({ files, manifest, read }: PackedPackage): string[] {
  const problems: string[] = [];
  for (const file of files) {
    if (
      !ALWAYS_INCLUDED.includes(file) &&
      !ALLOWED_FOLDERS.some((folder) => file.startsWith(folder))
    ) {
      problems.push(`${file} would be published, but only skills/, templates/ and dist/ ship.`);
    }
  }
  for (const file of REQUIRED_FILES.filter((required) => !files.includes(required))) {
    problems.push(`${file} is missing from the package.`);
  }

  const scripts = (manifest.scripts ?? {}) as Record<string, unknown>;
  for (const script of INSTALL_SCRIPTS.filter((name) => name in scripts)) {
    problems.push(
      `package.json has a "${script}" script, which would run in every repository that installs the package.`,
    );
  }
  const dependencies = Object.keys(manifest.dependencies ?? {});
  if (dependencies.length > 0) {
    problems.push(
      `package.json has runtime dependencies (${dependencies.join(', ')}), but the package must have none.`,
    );
  }

  for (const file of files) {
    for (const placeholder of PLACEHOLDERS.filter((value) => read(file).includes(value))) {
      problems.push(`${file} still contains the placeholder "${placeholder}".`);
    }
  }
  return problems;
}

// CODEOWNERS doesn't ship, but a release must not go out while it names a team that doesn't exist.
// Comments may mention the placeholder; owner lines may not.
export function checkCodeowners(text: string): string[] {
  const ownerLines = text.split('\n').filter((line) => !line.trimStart().startsWith('#'));
  return PLACEHOLDERS.filter((value) => ownerLines.some((line) => line.includes(value))).map(
    (placeholder) =>
      `.github/CODEOWNERS still names the placeholder team "${placeholder}". Replace it with the real team.`,
  );
}
