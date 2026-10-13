import { afterEach, describe, expect, it } from 'vitest';
import { checkAgentsMd, LINE_LIMIT, PATH_BYTE_LIMIT } from '../../src/lib/agents-md.ts';
import { createTempRepo, type FixtureName, type TempRepo } from '../helpers/temp-repo.ts';
import { writeTree } from '../helpers/tree.ts';

const repos: TempRepo[] = [];
afterEach(() => {
  for (const repo of repos.splice(0)) repo.cleanup();
});

function repoWith(files: Record<string, string>, fixture: FixtureName = 'workspace'): TempRepo {
  const repo = createTempRepo(fixture);
  repos.push(repo);
  writeTree(repo.root, files);
  return repo;
}

const lines = (count: number) =>
  `${Array.from({ length: count }, (_, i) => `Line ${String(i + 1)}`).join('\n')}\n`;
const bytes = (count: number) => 'x'.repeat(count);

describe('checkAgentsMd', () => {
  it('passes short files', () => {
    expect(
      checkAgentsMd(
        repoWith({ 'AGENTS.md': lines(LINE_LIMIT), 'apps/web/AGENTS.md': lines(20) }).root,
      ),
    ).toEqual({
      warnings: [],
      failures: [],
    });
  });

  it('warns about any one file over about 100 lines, including nested ones', () => {
    const { root } = repoWith({
      'AGENTS.md': lines(LINE_LIMIT + 1),
      'apps/web/AGENTS.md': lines(150),
    });
    expect(checkAgentsMd(root)).toEqual({
      warnings: [
        `AGENTS.md has ${String(LINE_LIMIT + 1)} lines. Keep it to about 100, and move how-to guidance into skills.`,
        'apps/web/AGENTS.md has 150 lines. Keep it to about 100, and move how-to guidance into skills.',
      ],
      failures: [],
    });
  });

  it('fails a single file over 32 KiB', () => {
    const { root } = repoWith({ 'AGENTS.md': bytes(PATH_BYTE_LIMIT + 1) });
    expect(checkAgentsMd(root).failures).toEqual([
      'AGENTS.md total 32769 bytes, over the 32768-byte (32 KiB) budget Codex reads. Shorten them, or move guidance into skills.',
    ]);
  });

  it('allows exactly 32 KiB', () => {
    expect(checkAgentsMd(repoWith({ 'AGENTS.md': bytes(PATH_BYTE_LIMIT) }).root).failures).toEqual(
      [],
    );
  });

  it('fails nested files that together pass 32 KiB on one path, reporting the path once', () => {
    const { root } = repoWith({
      'AGENTS.md': bytes(20_000),
      'apps/AGENTS.md': bytes(10_000),
      'apps/web/AGENTS.md': bytes(3_000),
      'packages/ui/AGENTS.md': bytes(3_000),
    });
    expect(checkAgentsMd(root).failures).toEqual([
      'AGENTS.md + apps/AGENTS.md + apps/web/AGENTS.md total 33000 bytes, over the 32768-byte (32 KiB) budget Codex reads. Shorten them, or move guidance into skills.',
    ]);
  });

  it("doesn't add up files on different paths", () => {
    const { root } = repoWith({
      'apps/web/AGENTS.md': bytes(20_000),
      'packages/ui/AGENTS.md': bytes(20_000),
    });
    expect(checkAgentsMd(root).failures).toEqual([]);
  });

  it('reports separate over-budget paths separately', () => {
    const { root } = repoWith({
      'AGENTS.md': bytes(30_000),
      'apps/web/AGENTS.md': bytes(3_000),
      'packages/ui/AGENTS.md': bytes(3_000),
    });
    expect(checkAgentsMd(root).failures.map((failure) => failure.split(' total')[0])).toEqual([
      'AGENTS.md + apps/web/AGENTS.md',
      'AGENTS.md + packages/ui/AGENTS.md',
    ]);
  });

  it('counts untracked files but skips ignored ones, such as in node_modules', () => {
    const { root } = repoWith({
      '.gitignore': 'node_modules/\n',
      'node_modules/some-package/AGENTS.md': bytes(PATH_BYTE_LIMIT + 1),
      'apps/web/AGENTS.md': lines(LINE_LIMIT + 5),
    });
    expect(checkAgentsMd(root)).toEqual({
      warnings: [expect.stringContaining('apps/web/AGENTS.md has 105 lines') as unknown],
      failures: [],
    });
  });

  it('copes with no AGENTS.md at all', () => {
    expect(checkAgentsMd(repoWith({}, 'single-package').root)).toEqual({
      warnings: [],
      failures: [],
    });
  });
});
