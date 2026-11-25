// Reads the few settings init needs from pnpm-workspace.yaml and dependabot.yml. The package has
// no runtime dependencies, so this is a small indentation-based reader, not a YAML parser: it
// handles block and flow lists of plain or quoted names, which is how these files are written.

export const PACKAGE_NAME = '@oaknational/oak-agent-skills';

interface Line {
  indent: number;
  text: string;
}

function readLines(yaml: string): Line[] {
  return yaml
    .split(/\r?\n/)
    .map((raw) => raw.replace(/(^|\s)#.*$/, '').trimEnd())
    .filter((line) => line.trim() !== '')
    .flatMap((line) => {
      const indent = line.length - line.trimStart().length;
      const text = line.trim();
      // "- key: value" starts a mapping in a list, so the key belongs one level deeper.
      const item = /^- ([A-Za-z0-9_-]+\s*:(?:\s.*)?)$/.exec(text);
      return item?.[1] === undefined
        ? [{ indent, text }]
        : [
            { indent, text: '-' },
            { indent: indent + 2, text: item[1] },
          ];
    });
}

const unquote = (value: string) => value.trim().replace(/^(['"])(.*)\1$/, '$2');

function keyValue(line: Line, key: string): string | undefined {
  const match = new RegExp(`^(?:${key}|'${key}'|"${key}")\\s*:(.*)$`).exec(line.text);
  return match?.[1]?.trim();
}

// The list under the key on lines[index], in block style on the following lines or flow style inline.
function listAt(lines: Line[], index: number, inline: string): string[] {
  if (inline.startsWith('[')) {
    return inline
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(unquote)
      .filter((item) => item !== '');
  }
  const keyIndent = lines[index]?.indent ?? 0;
  const items: string[] = [];
  for (const line of lines.slice(index + 1)) {
    if (line.indent < keyIndent || (line.indent === keyIndent && !line.text.startsWith('-'))) break;
    if (line.text.startsWith('- ')) items.push(unquote(line.text.slice(2)));
  }
  return items;
}

// Every list under the given key, anywhere in the file, optionally only inside a parent key.
function listsUnder(yaml: string, key: string, parent?: string): string[][] {
  const lines = readLines(yaml);
  const lists: string[][] = [];
  lines.forEach((line, index) => {
    const inline = keyValue(line, key);
    if (inline === undefined) return;
    if (parent !== undefined) {
      const owner = lines
        .slice(0, index)
        .reverse()
        .find((candidate) => candidate.indent < line.indent);
      if (owner === undefined || keyValue(owner, parent) === undefined) return;
    }
    lists.push(listAt(lines, index, inline));
  });
  return lists;
}

// A Dependabot or pnpm pattern, where * matches anything.
export function matchesPackage(pattern: string, name: string = PACKAGE_NAME): boolean {
  const regex = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
  );
  return regex.test(name);
}

export interface ReleaseAge {
  // pnpm's minimumReleaseAge, in minutes, when it's set.
  minutes: number | undefined;
  exempt: boolean;
}

export function readReleaseAge(workspaceYaml: string): ReleaseAge {
  const top = readLines(workspaceYaml).filter((line) => line.indent === 0);
  const value = top.map((line) => keyValue(line, 'minimumReleaseAge')).find((v) => v !== undefined);
  const minutes = value === undefined ? undefined : Number(unquote(value));
  const exclusions = listsUnder(workspaceYaml, 'minimumReleaseAgeExclude').flat();
  return {
    minutes: minutes !== undefined && Number.isFinite(minutes) && minutes > 0 ? minutes : undefined,
    exempt: exclusions.some((pattern) => matchesPackage(pattern)),
  };
}

export interface DependabotSettings {
  // The root npm update puts the package in a group of its own before any group that takes it.
  ownGroupFirst: boolean;
  catchAllGroups: string[];
  // Whether the root npm update sets a cooldown, and whether it exempts the package.
  hasCooldown: boolean;
  cooldownExempt: boolean;
}

interface Group {
  name: string;
  patterns: string[] | undefined;
  excludePatterns: string[];
  securityUpdates: boolean;
  productionOnly: boolean;
}

function updateEntries(lines: Line[]): Line[][] {
  const start = lines.findIndex(
    (line) => line.indent === 0 && keyValue(line, 'updates') !== undefined,
  );
  if (start === -1) return [];
  const entries: Line[][] = [];
  let itemIndent: number | undefined;
  for (const line of lines.slice(start + 1)) {
    if (line.indent === 0 && line.text !== '-') break;
    if (line.text === '-' && (itemIndent === undefined || line.indent === itemIndent)) {
      itemIndent = line.indent;
      entries.push([]);
    } else {
      entries.at(-1)?.push(line);
    }
  }
  return entries.filter((entry) => entry.length > 0);
}

function topLevel(entry: Line[]): { indent: number; value: (key: string) => string | undefined } {
  const indent = Math.min(...entry.map((line) => line.indent));
  return {
    indent,
    value: (key) =>
      entry
        .filter((line) => line.indent === indent)
        .map((line) => keyValue(line, key))
        .find((value) => value !== undefined),
  };
}

function listIn(lines: Line[], indent: number, key: string): string[] | undefined {
  const index = lines.findIndex(
    (line) => line.indent === indent && keyValue(line, key) !== undefined,
  );
  if (index === -1) return undefined;
  return listAt(lines, index, keyValue(lines[index] as Line, key) ?? '');
}

function coversRoot(entry: Line[]): boolean {
  const { indent, value } = topLevel(entry);
  const directory = value('directory');
  if (directory !== undefined) return ['/', '.', './'].includes(unquote(directory));
  const directories = listIn(entry, indent, 'directories') ?? [];
  return directories.some((dir) => dir === '/' || dir.startsWith('/**') || dir.startsWith('**'));
}

function groupsIn(entry: Line[]): Group[] {
  const { indent } = topLevel(entry);
  const start = entry.findIndex(
    (line) => line.indent === indent && keyValue(line, 'groups') !== undefined,
  );
  if (start === -1) return [];
  const blocks: { name: string; lines: Line[] }[] = [];
  let groupIndent: number | undefined;
  for (const line of entry.slice(start + 1)) {
    if (line.indent <= indent) break;
    groupIndent ??= line.indent;
    if (line.indent === groupIndent) {
      blocks.push({ name: unquote(line.text.replace(/\s*:.*$/, '')), lines: [] });
    } else {
      blocks.at(-1)?.lines.push(line);
    }
  }
  return blocks.map(({ name, lines }) => {
    const propertyIndent = Math.min(...lines.map((line) => line.indent));
    const property = (key: string) =>
      lines
        .filter((line) => line.indent === propertyIndent)
        .map((line) => keyValue(line, key))
        .find((value) => value !== undefined);
    return {
      name,
      patterns: listIn(lines, propertyIndent, 'patterns'),
      excludePatterns: listIn(lines, propertyIndent, 'exclude-patterns') ?? [],
      securityUpdates: unquote(property('applies-to') ?? '') === 'security-updates',
      productionOnly: unquote(property('dependency-type') ?? '') === 'production',
    };
  });
}

const takesPackage = (group: Group) =>
  !group.productionOnly &&
  !group.excludePatterns.some((pattern) => matchesPackage(pattern)) &&
  (group.patterns === undefined || group.patterns.some((pattern) => matchesPackage(pattern)));

const isOwnGroup = (group: Group) =>
  group.patterns !== undefined &&
  group.patterns.length > 0 &&
  group.patterns.every((pattern) => !pattern.includes('*') && matchesPackage(pattern));

export function readDependabot(dependabotYaml: string): DependabotSettings {
  const npm = updateEntries(readLines(dependabotYaml)).filter(
    (entry) => unquote(topLevel(entry).value('package-ecosystem') ?? '') === 'npm',
  );
  const root = npm.filter(coversRoot);
  const entries = root.length > 0 ? root : npm;

  let ownGroupFirst = entries.length > 0;
  const catchAllGroups: string[] = [];
  for (const entry of entries) {
    const groups = groupsIn(entry).filter(takesPackage);
    const versionGroups = groups.filter((group) => !group.securityUpdates);
    const ownIndex = versionGroups.findIndex(isOwnGroup);
    if (ownIndex !== 0) ownGroupFirst = false;
    const before = ownIndex === -1 ? versionGroups : versionGroups.slice(0, ownIndex);
    const security = groups.filter((group) => group.securityUpdates && !isOwnGroup(group));
    for (const group of [...before, ...security]) {
      if (!catchAllGroups.includes(group.name)) catchAllGroups.push(group.name);
    }
  }

  const cooldowns = entries.map((entry) => {
    const { indent } = topLevel(entry);
    const at = entry.findIndex(
      (line) => line.indent === indent && keyValue(line, 'cooldown') !== undefined,
    );
    if (at === -1) return undefined;
    const block = [];
    for (const line of entry.slice(at + 1)) {
      if (line.indent <= indent) break;
      block.push(line);
    }
    const propertyIndent = Math.min(...block.map((line) => line.indent));
    return listIn(block, propertyIndent, 'exclude') ?? [];
  });
  const set = cooldowns.filter((exclude) => exclude !== undefined);
  return {
    ownGroupFirst,
    catchAllGroups,
    hasCooldown: set.length > 0,
    cooldownExempt:
      set.length > 0 && set.every((exclude) => exclude.some((pattern) => matchesPackage(pattern))),
  };
}
