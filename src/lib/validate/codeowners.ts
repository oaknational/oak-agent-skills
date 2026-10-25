import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Problem } from './problem.ts';

export const CODEOWNERS_PATH = '.github/CODEOWNERS';
export const MAINTAINERS = '@oaknational/skills-maintainers';

interface Rule {
  line: number;
  pattern: string;
  owners: string[];
}

function parseCodeowners(text: string): Rule[] {
  const rules: Rule[] = [];
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/#.*$/, '').trim();
    if (line === '') return;
    const [pattern = '', ...owners] = line.split(/\s+/);
    rules.push({ line: index + 1, pattern, owners });
  });
  return rules;
}

// bundles are the repository codes, the folder names under skills/repos/.
export function checkCodeowners(root: string, bundles: readonly string[]): Problem[] {
  const file = join(root, CODEOWNERS_PATH);
  if (!existsSync(file)) {
    return [{ file: CODEOWNERS_PATH, message: 'is missing' }];
  }
  const rules = parseCodeowners(readFileSync(file, 'utf8'));
  const problems: Problem[] = [];
  for (const rule of rules.filter((r) => !r.owners.includes(MAINTAINERS))) {
    problems.push({
      file: `${CODEOWNERS_PATH}:${String(rule.line)}`,
      message: `doesn't list ${MAINTAINERS}. Every line must, so the skills maintainers can review anything.`,
    });
  }
  for (const code of bundles) {
    const folder = `skills/repos/${code}/`;
    const covered = rules.some((rule) => rule.pattern.replace(/^\//, '') === folder);
    if (!covered) {
      problems.push({
        file: CODEOWNERS_PATH,
        message: `has no line for /${folder}. Add one naming ${MAINTAINERS}.`,
      });
    }
  }
  return problems;
}
