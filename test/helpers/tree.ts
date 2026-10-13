import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export function makeTempDir(prefix: string): string {
  return realpathSync(mkdtempSync(join(tmpdir(), `oak-skills-${prefix}-`)));
}

export function writeTree(root: string, files: Record<string, string>): void {
  for (const [path, contents] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), contents);
  }
}

export function removeTree(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

export interface SkillOptions {
  name?: string;
  description?: string;
  extraFrontmatter?: string;
  metadata?: string;
  body?: string;
}

export function skillText(options: SkillOptions = {}): string {
  const name = options.name ?? 'oak-example';
  return [
    '---',
    `name: ${name}`,
    `description: ${options.description ?? `Does ${name} things. Use it when a test needs a skill.`}`,
    'license: MIT',
    ...(options.extraFrontmatter === undefined ? [] : [options.extraFrontmatter]),
    'metadata:',
    options.metadata ?? "  owner: '@oaknational/skills-maintainers'\n  updated: '2026-10-13'",
    '---',
    '',
    options.body ?? `# ${name}\n\nSome guidance.`,
    '',
  ].join('\n');
}
