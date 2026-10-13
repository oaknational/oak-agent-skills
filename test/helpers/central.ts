import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { GitHub, PullRequest } from '../../src/lib/github.ts';
import { packageFixture, repoRoot } from './paths.ts';
import { isolatedGitEnv } from './temp-repo.ts';
import { makeTempDir, removeTree } from './tree.ts';

export interface CentralRemote {
  // A bare repository standing in for oaknational/oak-agent-skills on GitHub.
  remote: string;
  // Commits to main after the release, as other pull requests would.
  commitToMain: (files: Record<string, string | null>, message: string) => void;
  read: (ref: string, path: string) => string;
  cleanup: () => void;
}

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', args, { cwd, env: isolatedGitEnv, encoding: 'utf8' }).trim();

// The central repository at release tag v<version>, built from the stand-in package's skills.
export function createCentralRemote(version = '1.2.3', packageDir = packageFixture): CentralRemote {
  const base = makeTempDir('central');
  const work = join(base, 'work');
  const remote = join(base, 'remote.git');
  mkdirSync(join(work, '.github'), { recursive: true });
  mkdirSync(join(work, '.changeset'), { recursive: true });
  cpSync(join(packageDir, 'skills'), join(work, 'skills'), { recursive: true });
  cpSync(
    join(repoRoot, '.github/pull_request_template.md'),
    join(work, '.github/pull_request_template.md'),
  );
  writeFileSync(join(work, '.changeset/config.json'), '{}\n');
  git(base, 'init', '--quiet', '--initial-branch=main', work);
  git(work, 'add', '--all');
  git(work, 'commit', '--quiet', '--message', `chore: release ${version}`);
  git(work, 'tag', `v${version}`);
  git(base, 'clone', '--quiet', '--bare', work, remote);
  git(work, 'remote', 'add', 'upstream', remote);
  return {
    remote,
    commitToMain: (files, message) => {
      for (const [path, contents] of Object.entries(files)) {
        if (contents === null) removeTree(join(work, path));
        else writeFileSync(join(work, path), contents);
      }
      git(work, 'add', '--all');
      git(work, 'commit', '--quiet', '--message', message);
      git(work, 'push', '--quiet', 'upstream', 'main');
    },
    read: (ref, path) => git(remote, 'show', `${ref}:${path}`),
    cleanup: () => {
      removeTree(base);
    },
  };
}

export interface FakeGitHub extends GitHub {
  pullRequests: PullRequest[];
  cloned: number;
}

export function fakeGitHub(central: CentralRemote, overrides: Partial<GitHub> = {}): FakeGitHub {
  const fake: FakeGitHub = {
    pullRequests: [],
    cloned: 0,
    problem: () => undefined,
    canPush: () => true,
    clone: (_repo, dir) => {
      fake.cloned += 1;
      execFileSync('git', ['clone', '--quiet', central.remote, dir], { env: isolatedGitEnv });
    },
    pullRequestTemplate: () =>
      readFileSync(join(repoRoot, '.github/pull_request_template.md'), 'utf8'),
    createPullRequest: (pr) => {
      fake.pullRequests.push(pr);
      return `https://github.com/oaknational/oak-agent-skills/pull/${String(fake.pullRequests.length)}`;
    },
    ...overrides,
  };
  return fake;
}
