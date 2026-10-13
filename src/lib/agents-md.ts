import { readFileSync, statSync } from 'node:fs';
import { join, posix } from 'node:path';
import { runGit } from './git.ts';

// Agents load AGENTS.md on every request, so it should stay short: about 100 lines.
export const LINE_LIMIT = 100;
// Codex counts every AGENTS.md from the repository root down to the working folder against one
// budget, and cuts off anything beyond it.
export const PATH_BYTE_LIMIT = 32 * 1024;

export interface AgentsMdReport {
  warnings: string[];
  failures: string[];
}

// Tracked and untracked AGENTS.md files, leaving out anything git ignores, such as node_modules.
function findAgentsMd(root: string): string[] {
  return runGit(['ls-files', '-z', '--cached', '--others', '--exclude-standard'], root)
    .split('\0')
    .filter((path) => path === 'AGENTS.md' || path.endsWith('/AGENTS.md'))
    .sort();
}

export function checkAgentsMd(root: string): AgentsMdReport {
  const files = findAgentsMd(root);
  const sizes = new Map(files.map((file) => [file, statSync(join(root, file)).size]));
  const report: AgentsMdReport = { warnings: [], failures: [] };

  for (const file of files) {
    const lines = readFileSync(join(root, file), 'utf8').replace(/\n$/, '').split('\n').length;
    if (lines > LINE_LIMIT) {
      report.warnings.push(
        `${file} has ${String(lines)} lines. Keep it to about ${String(LINE_LIMIT)}, and move how-to guidance into skills.`,
      );
    }
  }

  // Each AGENTS.md is the end of a chain of files from the root down to its folder.
  const chains = files.map((file) => {
    const chain: string[] = [];
    let dir = posix.dirname(file);
    for (;;) {
      const candidate = dir === '.' ? 'AGENTS.md' : `${dir}/AGENTS.md`;
      if (sizes.has(candidate)) chain.unshift(candidate);
      if (dir === '.') break;
      dir = posix.dirname(dir);
    }
    return { chain, total: chain.reduce((sum, path) => sum + (sizes.get(path) ?? 0), 0) };
  });
  const over = chains.filter(({ total }) => total > PATH_BYTE_LIMIT);
  // Report each over-budget path once: skip a chain that a longer over-budget chain contains.
  for (const { chain, total } of over) {
    const containedIn = over.some(
      (other) =>
        other.chain.length > chain.length && chain.every((path, i) => other.chain[i] === path),
    );
    if (containedIn) continue;
    report.failures.push(
      `${chain.join(' + ')} total ${String(total)} bytes, over the ${String(PATH_BYTE_LIMIT)}-byte (32 KiB) budget Codex reads. Shorten them, or move guidance into skills.`,
    );
  }
  return report;
}
