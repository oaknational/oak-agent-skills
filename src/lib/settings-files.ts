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
  // A group whose patterns include the package.
  hasGroup: boolean;
  // Whether any update sets a cooldown, and whether every cooldown exempts the package.
  hasCooldown: boolean;
  cooldownExempt: boolean;
}

export function readDependabot(dependabotYaml: string): DependabotSettings {
  const lines = readLines(dependabotYaml);
  const cooldowns = lines.filter((line) => keyValue(line, 'cooldown') !== undefined).length;
  const exclusions = listsUnder(dependabotYaml, 'exclude', 'cooldown');
  return {
    hasGroup: listsUnder(dependabotYaml, 'patterns').some((list) =>
      list.some((p) => matchesPackage(p)),
    ),
    hasCooldown: cooldowns > 0,
    cooldownExempt:
      cooldowns > 0 &&
      exclusions.length === cooldowns &&
      exclusions.every((list) => list.some((pattern) => matchesPackage(pattern))),
  };
}
