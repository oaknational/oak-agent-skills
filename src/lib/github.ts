import { execFileSync } from 'node:child_process';
import { OakSkillsError } from './errors.ts';

export const CENTRAL_REPO = 'oaknational/oak-agent-skills';

export interface PullRequest {
  repo: string;
  // The clone the branch was pushed from.
  cwd: string;
  base: string;
  head: string;
  title: string;
  body: string;
  draft: boolean;
}

// Every call to GitHub goes through this, so tests can replace it with a local stand-in.
export interface GitHub {
  // Undefined when gh is ready; otherwise what's wrong and how to fix it.
  problem: () => string | undefined;
  canPush: (repo: string) => boolean;
  clone: (repo: string, dir: string) => void;
  pullRequestTemplate: (repo: string) => string;
  createPullRequest: (pullRequest: PullRequest) => string;
}

function gh(args: readonly string[], options: { cwd?: string; input?: string } = {}): string {
  try {
    return execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
      ...(options.input === undefined ? {} : { input: options.input }),
    }).trim();
  } catch (error) {
    const { stderr } = error as { stderr?: string };
    throw new OakSkillsError(`gh ${args.slice(0, 2).join(' ')} failed: ${(stderr ?? '').trim()}`);
  }
}

function succeeds(args: readonly string[]): boolean {
  try {
    execFileSync('gh', args, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export const ghCli: GitHub = {
  problem: () => {
    if (!succeeds(['--version']))
      return 'The GitHub CLI, gh, is not installed. Install it from https://cli.github.com/.';
    if (!succeeds(['auth', 'status'])) return 'gh is not signed in. Run "gh auth login" first.';
    return undefined;
  },
  canPush: (repo) => gh(['api', `repos/${repo}`, '--jq', '.permissions.push']) === 'true',
  // A blobless clone keeps the full history, which the three-way merge needs, but fetches file
  // contents only as they're used.
  clone: (repo, dir) => {
    gh(['repo', 'clone', repo, dir, '--', '--filter=blob:none', '--quiet']);
  },
  pullRequestTemplate: (repo) =>
    gh([
      'api',
      `repos/${repo}/contents/.github/pull_request_template.md`,
      '-H',
      'Accept: application/vnd.github.raw',
    ]),
  createPullRequest: (pr) =>
    gh(
      [
        'pr',
        'create',
        '--repo',
        pr.repo,
        '--base',
        pr.base,
        '--head',
        pr.head,
        '--title',
        pr.title,
        '--body-file',
        '-',
        ...(pr.draft ? ['--draft'] : []),
      ],
      { cwd: pr.cwd, input: pr.body },
    ),
};
