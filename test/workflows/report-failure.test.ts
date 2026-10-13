import { spawnSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { loadDevDependencies } from '../../src/lib/validate/dev-dependencies.ts';
import { repoRoot } from '../helpers/paths.ts';
import { makeTempDir, removeTree } from '../helpers/tree.ts';

interface Job {
  if?: string;
  permissions?: Record<string, string>;
  steps: { run?: string }[];
}

const WORKFLOWS = ['skill-scan.yml', 'coverage-matrix.yml', 'link-check.yml'];
const jobs = new Map<string, Record<string, Job>>();
beforeAll(async () => {
  const { yaml } = await loadDevDependencies();
  for (const name of WORKFLOWS) {
    const workflow = yaml.parse(
      readFileSync(join(repoRoot, '.github/workflows', name), 'utf8'),
    ) as {
      jobs: Record<string, Job>;
    };
    jobs.set(name, workflow.jobs);
  }
});

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) removeTree(dir);
});

// Runs the report step with a stand-in gh that has, or hasn't, an open issue already.
function report(workflow: string, existingIssue: string) {
  const bin = makeTempDir('gh');
  dirs.push(bin);
  writeFileSync(
    join(bin, 'gh'),
    `#!/bin/sh\nprintf '%s\\0' "$*" >> "${bin}/calls"\n[ "$2" = list ] && echo '${existingIssue}'\nexit 0\n`,
  );
  chmodSync(join(bin, 'gh'), 0o755);
  const script = jobs.get(workflow)?.['report-failure']?.steps[0]?.run ?? '';
  const result = spawnSync('bash', ['-eo', 'pipefail', '-c', script], {
    encoding: 'utf8',
    env: {
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      GH_TOKEN: 't',
      REPO: 'oaknational/oak-agent-skills',
      RUN_URL: 'https://github.com/oaknational/oak-agent-skills/actions/runs/1',
    },
  });
  return {
    status: result.status,
    calls: readFileSync(join(bin, 'calls'), 'utf8')
      .split('\0')
      .filter((call) => call !== ''),
  };
}

describe.each(WORKFLOWS)('the %s failure report', (workflow) => {
  it('runs only when a scheduled run fails, with write access to issues only', () => {
    const job = jobs.get(workflow)?.['report-failure'];
    expect(job?.if).toBe("failure() && github.event_name == 'schedule'");
    expect(job?.permissions).toEqual({ issues: 'write' });
  });

  it('opens an issue for the skills maintainers', () => {
    const { status, calls } = report(workflow, '');
    expect(status).toBe(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]).toMatch(
      /^issue create --repo oaknational\/oak-agent-skills --title The weekly .+ failed --body /,
    );
    expect(calls[1]).toContain('@oaknational/skills-maintainers');
  });

  it('comments on the open issue instead of opening another', () => {
    const { calls } = report(workflow, '42');
    expect(calls[1]).toMatch(/^issue comment 42 --repo oaknational\/oak-agent-skills --body /);
  });
});
