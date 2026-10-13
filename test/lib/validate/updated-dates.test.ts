import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { OakSkillsError } from '../../../src/lib/errors.ts';
import {
  loadDevDependencies,
  type DevDependencies,
} from '../../../src/lib/validate/dev-dependencies.ts';
import { validateRepository } from '../../../src/lib/validate/repository.ts';
import {
  compileSchemas,
  type SchemaName,
  type SchemaValidator,
} from '../../../src/lib/validate/schemas.ts';
import { checkUpdatedDates } from '../../../src/lib/validate/updated-dates.ts';
import { createTempRepo, isolatedGitEnv, type TempRepo } from '../../helpers/temp-repo.ts';
import { makeTempDir, removeTree, skillText, writeTree } from '../../helpers/tree.ts';

let deps: DevDependencies;
let validators: Record<SchemaName, SchemaValidator>;
beforeAll(async () => {
  deps = await loadDevDependencies();
  validators = compileSchemas(deps);
});

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function central(): TempRepo {
  const repo = createTempRepo('central-repo');
  cleanups.push(repo.cleanup);
  return repo;
}

const SKILL = 'skills/central/oak-example/SKILL.md';
const GUIDE = 'skills/central/oak-example/references/guide.md';

function dateProblems(root: string, env: NodeJS.ProcessEnv = {}, now?: Date): string[] {
  const { skills } = validateRepository(root, deps, validators, {});
  return checkUpdatedDates(root, skills, deps, env, now).map((p) => `${p.file}: ${p.message}`);
}

function setUpdated(root: string, date: string): void {
  const file = join(root, SKILL);
  writeFileSync(file, readFileSync(file, 'utf8').replace(/updated: '[^']+'/, `updated: '${date}'`));
}

const unchangedMessage = (since: string) =>
  `${SKILL}: has changed since ${since}, but metadata.updated is still 2025-06-01. Set it to today's date.`;

describe('checkUpdatedDates, against the last commit', () => {
  it('passes when no skill has changed', () => {
    expect(dateProblems(central().root)).toEqual([]);
  });

  it('fails a skill whose files changed but whose date did not', () => {
    const repo = central();
    writeFileSync(join(repo.root, GUIDE), '# Guide\n\nMore detail.\n');
    expect(dateProblems(repo.root)).toEqual([unchangedMessage('the last commit')]);
  });

  it('fails a staged change too', () => {
    const repo = central();
    writeFileSync(join(repo.root, GUIDE), '# Guide\n\nMore detail.\n');
    repo.git('add', GUIDE);
    expect(dateProblems(repo.root)).toEqual([unchangedMessage('the last commit')]);
  });

  it('passes a changed skill with a new date', () => {
    const repo = central();
    writeFileSync(join(repo.root, GUIDE), '# Guide\n\nMore detail.\n');
    setUpdated(repo.root, '2026-10-14');
    expect(dateProblems(repo.root)).toEqual([]);
  });

  it('passes a new skill with any date', () => {
    const repo = central();
    writeTree(repo.root, { 'skills/central/oak-new/SKILL.md': skillText({ name: 'oak-new' }) });
    expect(dateProblems(repo.root)).toEqual([]);
  });

  it('passes a renamed file in a skill whose date changed', () => {
    const repo = central();
    repo.git('mv', GUIDE, 'skills/central/oak-example/references/renamed.md');
    writeFileSync(
      join(repo.root, SKILL),
      readFileSync(join(repo.root, SKILL), 'utf8').replace(/guide\.md/g, 'renamed.md'),
    );
    expect(dateProblems(repo.root)).toEqual([unchangedMessage('the last commit')]);
    setUpdated(repo.root, '2026-10-14');
    expect(dateProblems(repo.root)).toEqual([]);
  });

  it('skips a skill whose frontmatter is broken, which validate reports separately', () => {
    const repo = central();
    writeFileSync(join(repo.root, SKILL), 'no frontmatter\n');
    expect(dateProblems(repo.root)).toEqual([]);
  });

  it.each([
    ['invalid YAML', '---\nname: [\n---\n'],
    ['no metadata.updated', '---\nname: oak-example\nmetadata:\n  owner: x\n---\n'],
    ['empty frontmatter', '---\n---\n'],
    ['no frontmatter', '# Example\n'],
  ])('treats a last commit with %s as having no date', (_label, before) => {
    const repo = central();
    const current = readFileSync(join(repo.root, SKILL), 'utf8');
    writeFileSync(join(repo.root, SKILL), before);
    repo.git('commit', '--quiet', '--all', '--message', 'chore: break it');
    writeFileSync(join(repo.root, SKILL), current);
    expect(dateProblems(repo.root)).toEqual([]);
  });

  it('skips a repository with no commits yet', () => {
    const root = makeTempDir('no-commits');
    cleanups.push(() => {
      removeTree(root);
    });
    execFileSync('git', ['init', '--quiet'], { cwd: root, env: isolatedGitEnv });
    writeTree(root, {
      'package.json': '{"name":"@oaknational/oak-agent-skills"}',
      [SKILL]: skillText(),
    });
    expect(dateProblems(root)).toEqual([]);
  });
});

describe('checkUpdatedDates, on the same day', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  function committedOn(date: string): TempRepo {
    const repo = central();
    setUpdated(repo.root, date);
    repo.git('commit', '--quiet', '--all', '--message', 'chore: date it');
    writeFileSync(join(repo.root, GUIDE), '# Guide\n\nA second change.\n');
    return repo;
  }

  it("passes a second change when the date is already today's", () => {
    const repo = committedOn('2026-10-20');
    expect(dateProblems(repo.root, {}, new Date('2026-10-20T12:00:00Z'))).toEqual([]);
  });

  it('fails the same change on a later day', () => {
    const repo = committedOn('2026-10-20');
    expect(dateProblems(repo.root, {}, new Date('2026-10-21T12:00:00Z'))).toHaveLength(1);
  });

  it('accepts the local date just after midnight, when UTC is still the day before', () => {
    vi.stubEnv('TZ', 'Europe/London');
    const repo = committedOn('2026-10-14');
    // 23:30 UTC on 13 October is 00:30 on 14 October in London, during British Summer Time.
    expect(dateProblems(repo.root, {}, new Date('2026-10-13T23:30:00Z'))).toEqual([]);
  });
});

describe('checkUpdatedDates, on a pull request', () => {
  function branchWithChange(repo: TempRepo): void {
    repo.git('switch', '--quiet', '--create', 'feature');
    writeFileSync(join(repo.root, GUIDE), '# Guide\n\nMore detail.\n');
    repo.git('commit', '--quiet', '--all', '--message', 'feat: more detail');
  }

  it('compares with where the branch left the base branch', () => {
    const repo = central();
    branchWithChange(repo);
    expect(dateProblems(repo.root, { GITHUB_BASE_REF: 'main' })).toEqual([
      unchangedMessage('main'),
    ]);
  });

  it('passes once the date has changed', () => {
    const repo = central();
    branchWithChange(repo);
    setUpdated(repo.root, '2026-10-14');
    repo.git('commit', '--quiet', '--all', '--message', 'chore: update the date');
    expect(dateProblems(repo.root, { GITHUB_BASE_REF: 'main' })).toEqual([]);
  });

  it('uses origin/<base> when it exists', () => {
    const repo = central();
    repo.git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    branchWithChange(repo);
    expect(dateProblems(repo.root, { GITHUB_BASE_REF: 'main' })).toEqual([
      unchangedMessage('main'),
    ]);
  });

  it('explains when the base branch is missing, as with a shallow checkout', () => {
    const repo = central();
    expect(() => dateProblems(repo.root, { GITHUB_BASE_REF: 'develop' })).toThrow(OakSkillsError);
    expect(() => dateProblems(repo.root, { GITHUB_BASE_REF: 'develop' })).toThrow(
      "Can't find where this branch left develop.",
    );
  });
});
