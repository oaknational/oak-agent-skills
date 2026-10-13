import { readFileSync } from 'node:fs';
import { join, posix } from 'node:path';
import { listFolder } from '../files.ts';
import { splitSkillFile } from '../skill-file.ts';
import type { SkillLocation } from './central-repo.ts';
import type { DevDependencies } from './dev-dependencies.ts';
import type { Problem } from './problem.ts';
import type { SchemaValidator } from './schemas.ts';

export const MAX_BODY_LINES = 500;

// Claude Code skips a skill folder named "synced", in any capitalisation, and won't load one
// named "anthropic-skills" or starting with "anthropic-skills:".
const RESERVED_NAMES = [/^synced$/i, /^anthropic-skills(?::|$)/i];

export interface Frontmatter {
  name: string;
  description: string;
  license: string;
  compatibility?: string;
  metadata: { owner: string; updated: string; deprecated?: string; source?: string };
}

export interface CheckedSkill {
  location: SkillLocation;
  // Present only when the frontmatter parsed and matched the schema.
  frontmatter: Frontmatter | undefined;
  problems: Problem[];
}

// Claude Code runs !`command` at the start of a line or after whitespace, and code blocks
// opened with ```!, before the skill reaches the model.
const INLINE_SHELL = /(?:^|\s)!`/;
const FENCED_SHELL = /^\s*(?:`{3,}|~{3,})!/;
const FENCE = /^\s*(?:`{3,}|~{3,})/;

const INLINE_LINK = /!?\[[^\]]*\]\(\s*<?([^)\s>]+)>?(?:\s+["'(][^)]*)?\)/g;
const REFERENCE_LINK = /^\s*\[[^\]]+\]:\s*<?(\S+?)>?(?:\s|$)/;
const CODE_PATH = /`((?:references|assets|scripts)\/[^`\s]+)`/g;

function isExternal(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('#');
}

// Blanks fenced code blocks, keeping line numbers, so example links inside them aren't checked.
function withoutCodeBlocks(lines: string[]): string[] {
  let open = false;
  return lines.map((line) => {
    if (FENCE.test(line)) {
      open = !open;
      return '';
    }
    return open ? '' : line;
  });
}

function checkReferences(
  skillPath: string,
  file: string,
  text: string,
  present: { files: Set<string>; folders: Set<string> },
): Problem[] {
  const problems: Problem[] = [];
  const lines = withoutCodeBlocks(text.split('\n'));
  const check = (target: string, from: string, line: number): void => {
    const withoutFragment = target.split(/[?#]/)[0] ?? '';
    if (withoutFragment === '' || isExternal(target)) return;
    let decoded = withoutFragment;
    try {
      decoded = decodeURIComponent(withoutFragment);
    } catch {
      // Not percent-encoded, so use it as written.
    }
    const resolved = posix.normalize(posix.join(posix.dirname(from), decoded)).replace(/\/$/, '');
    const where = `${skillPath}/${file}:${String(line)}`;
    if (decoded.startsWith('/') || resolved === '..' || resolved.startsWith('../')) {
      problems.push({
        file: where,
        message: `refers to ${target}, which is outside the skill. A synced skill only has its own files.`,
      });
    } else if (!present.files.has(resolved) && !present.folders.has(resolved)) {
      problems.push({ file: where, message: `refers to ${target}, which doesn't exist` });
    }
  };
  lines.forEach((line, index) => {
    for (const match of line.matchAll(INLINE_LINK)) check(match[1] ?? '', file, index + 1);
    const reference = REFERENCE_LINK.exec(line);
    if (reference) check(reference[1] ?? '', file, index + 1);
    // Paths in code are relative to the skill's folder, as the Agent Skills specification describes.
    for (const match of line.matchAll(CODE_PATH)) check(match[1] ?? '', 'SKILL.md', index + 1);
  });
  return problems;
}

function checkShellInjection(skillPath: string, text: string): Problem[] {
  const problems: Problem[] = [];
  text.split('\n').forEach((line, index) => {
    const file = `${skillPath}/SKILL.md:${String(index + 1)}`;
    if (FENCED_SHELL.test(line)) {
      problems.push({
        file,
        message:
          'opens a code block with "!", which Claude Code runs as a shell command before the skill reaches the model',
      });
    } else if (INLINE_SHELL.test(line)) {
      problems.push({
        file,
        message:
          'uses the !`command` syntax, which Claude Code runs as a shell command before the skill reaches the model',
      });
    }
  });
  return problems;
}

export function checkSkill(
  root: string,
  location: SkillLocation,
  deps: Pick<DevDependencies, 'yaml'>,
  validateFrontmatter: SchemaValidator,
): CheckedSkill {
  const { path, name, bundle } = location;
  const problems: Problem[] = [];
  const folder = join(root, path);
  const contents = listFolder(folder);
  const present = { files: new Set(contents.files), folders: new Set(contents.folders) };

  for (const other of contents.others) {
    problems.push({
      file: `${path}/${other}`,
      message: 'is a symlink or special file. Skills may hold only ordinary files and folders.',
    });
  }
  for (const pluginFolder of contents.folders.filter((f) =>
    f.split('/').includes('.claude-plugin'),
  )) {
    problems.push({
      file: `${path}/${pluginFolder}`,
      message:
        'would make Claude Code load the skill as a plugin. Skills must not contain .claude-plugin/.',
    });
  }
  if (RESERVED_NAMES.some((reserved) => reserved.test(name))) {
    problems.push({ file: path, message: `uses the name "${name}", which Claude Code reserves` });
  }
  const prefix = bundle === undefined ? 'oak-' : `${bundle}-`;
  if (!name.startsWith(prefix)) {
    problems.push({
      file: path,
      message:
        bundle === undefined
          ? 'is a shared skill, so its name must start with "oak-"'
          : `is in the ${bundle} bundle, so its name must start with "${prefix}"`,
    });
  }

  if (!present.files.has('SKILL.md')) {
    problems.push({ file: path, message: 'has no SKILL.md' });
    return { location, frontmatter: undefined, problems };
  }

  const skillText = readFileSync(join(folder, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  problems.push(...checkShellInjection(path, skillText));
  for (const file of contents.files.filter((f) => f.endsWith('.md'))) {
    const text = file === 'SKILL.md' ? skillText : readFileSync(join(folder, file), 'utf8');
    problems.push(...checkReferences(path, file, text, present));
  }

  const split = splitSkillFile(skillText);
  if (split === undefined) {
    problems.push({
      file: `${path}/SKILL.md`,
      message: 'must start with YAML frontmatter between two --- lines',
    });
    return { location, frontmatter: undefined, problems };
  }

  const bodyLines = split.body.replace(/\n$/, '').split('\n').length;
  if (bodyLines >= MAX_BODY_LINES) {
    problems.push({
      file: `${path}/SKILL.md`,
      message: `has a body of ${String(bodyLines)} lines. Keep it under ${String(MAX_BODY_LINES)}, with detail in references/.`,
    });
  }

  let parsed: unknown;
  try {
    parsed = deps.yaml.parse(split.frontmatter, { uniqueKeys: true });
  } catch (error) {
    problems.push({
      file: `${path}/SKILL.md`,
      message: `has frontmatter that isn't valid YAML: ${(error as Error).message.split('\n')[0] ?? ''}`,
    });
    return { location, frontmatter: undefined, problems };
  }

  const schemaProblems = validateFrontmatter(parsed);
  for (const problem of schemaProblems) {
    problems.push({
      file: `${path}/SKILL.md`,
      message: `frontmatter ${problem.path} ${problem.message}`,
    });
  }
  if (schemaProblems.length > 0) return { location, frontmatter: undefined, problems };

  const frontmatter = parsed as Frontmatter;
  if (frontmatter.name !== name) {
    problems.push({
      file: `${path}/SKILL.md`,
      message: `is named "${frontmatter.name}", but its folder is "${name}". They must match.`,
    });
  }
  const { updated } = frontmatter.metadata;
  // Date accepts 30 February by rolling it into March, so check it reads back unchanged.
  const date = new Date(`${updated}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== updated) {
    problems.push({
      file: `${path}/SKILL.md`,
      message: `has metadata.updated "${updated}", which isn't a real date`,
    });
  }
  return { location, frontmatter, problems };
}
