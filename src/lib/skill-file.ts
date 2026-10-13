export interface SkillFile {
  // The YAML between the opening and closing --- lines.
  frontmatter: string;
  body: string;
  // The 1-based line in SKILL.md where the body starts.
  bodyStartLine: number;
}

// Returns undefined when SKILL.md doesn't start with a frontmatter block.
export function splitSkillFile(text: string): SkillFile | undefined {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  if (lines[0] !== '---') return undefined;
  const close = lines.indexOf('---', 1);
  if (close === -1) return undefined;
  return {
    frontmatter: lines.slice(1, close).join('\n'),
    body: lines.slice(close + 1).join('\n'),
    bodyStartLine: close + 2,
  };
}
