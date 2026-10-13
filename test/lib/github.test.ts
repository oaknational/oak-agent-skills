import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ghCli } from '../../src/lib/github.ts';
import { makeTempDir, removeTree } from '../helpers/tree.ts';

// A stand-in gh on the PATH: it records each call, and its behaviour is set per test.
let bin: string;
beforeEach(() => {
  bin = makeTempDir('gh');
  vi.stubEnv('PATH', `${bin}:${process.env.PATH ?? ''}`);
});
afterEach(() => {
  vi.unstubAllEnvs();
  removeTree(bin);
});

function fakeGh(script: string): void {
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nprintf '%s\\n' "$*" >> "${bin}/calls"\ncat > "${bin}/stdin"\n${script}\n`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
}
const calls = () => readFileSync(join(bin, 'calls'), 'utf8').trim().split('\n');

describe('ghCli', () => {
  it('is ready when gh is installed and signed in', () => {
    fakeGh('exit 0');
    expect(ghCli.problem()).toBeUndefined();
    expect(calls()).toEqual(['--version', 'auth status']);
  });

  it('says when gh is not signed in', () => {
    fakeGh('[ "$1" = auth ] && exit 1; exit 0');
    expect(ghCli.problem()).toBe('gh is not signed in. Run "gh auth login" first.');
  });

  it('says when gh is not installed', () => {
    vi.stubEnv('PATH', bin);
    expect(ghCli.problem()).toContain('The GitHub CLI, gh, is not installed.');
  });

  it('checks push access through the API', () => {
    fakeGh('echo true');
    expect(ghCli.canPush('oaknational/oak-agent-skills')).toBe(true);
    expect(calls()).toEqual(['api repos/oaknational/oak-agent-skills --jq .permissions.push']);
    fakeGh('echo false');
    expect(ghCli.canPush('oaknational/oak-agent-skills')).toBe(false);
  });

  it('clones without blobs, keeping the full history', () => {
    fakeGh('exit 0');
    ghCli.clone('oaknational/oak-agent-skills', '/tmp/clone');
    expect(calls()).toEqual([
      'repo clone oaknational/oak-agent-skills /tmp/clone -- --filter=blob:none --quiet',
    ]);
  });

  it('fetches the raw pull request template', () => {
    fakeGh('echo "## Template"');
    expect(ghCli.pullRequestTemplate('oaknational/oak-agent-skills')).toBe('## Template');
    expect(calls()).toEqual([
      'api repos/oaknational/oak-agent-skills/contents/.github/pull_request_template.md -H Accept: application/vnd.github.raw',
    ]);
  });

  it('creates a pull request with the body on stdin, as a draft when asked', () => {
    fakeGh('echo https://github.com/oaknational/oak-agent-skills/pull/7');
    const pr = {
      repo: 'o/r',
      cwd: bin,
      base: 'main',
      head: 'promote/x',
      title: 'fix(x): y',
      body: 'The body',
      draft: false,
    };
    expect(ghCli.createPullRequest(pr)).toBe(
      'https://github.com/oaknational/oak-agent-skills/pull/7',
    );
    expect(readFileSync(join(bin, 'stdin'), 'utf8')).toBe('The body');
    ghCli.createPullRequest({ ...pr, draft: true });
    expect(calls()).toEqual([
      'pr create --repo o/r --base main --head promote/x --title fix(x): y --body-file -',
      'pr create --repo o/r --base main --head promote/x --title fix(x): y --body-file - --draft',
    ]);
  });

  it("reports gh's error output when a call fails", () => {
    fakeGh('echo "HTTP 404: Not Found" >&2; exit 1');
    expect(() => ghCli.pullRequestTemplate('o/r')).toThrow(
      'gh api repos/o/r/contents/.github/pull_request_template.md failed: HTTP 404: Not Found',
    );
  });
});
