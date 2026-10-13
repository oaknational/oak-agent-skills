import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { readPackageInfo } from '../../src/lib/package-info.ts';
import { builtCli } from '../helpers/paths.ts';
import { createTempRepo } from '../helpers/temp-repo.ts';

function oakSkills(...args: string[]) {
  return spawnSync(process.execPath, [builtCli, ...args], { encoding: 'utf8' });
}

describe('the built oak-skills command', () => {
  it('prints its version and exits 0', () => {
    const result = oakSkills('--version');
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(`${readPackageInfo().version}\n`);
  });

  it('exits with the usage code on an unknown command', () => {
    const result = oakSkills('not-a-command');
    expect(result.status).toBe(64);
    expect(result.stderr).toContain('Unknown command: not-a-command');
  });
});

describe('the built oak-skills command, with no arguments', () => {
  it('prints usage and exits 0', () => {
    const result = spawnSync(process.execPath, [builtCli], { encoding: 'utf8' });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: oak-skills <command> [options]');
  });
});

describe('the built oak-skills validate command', () => {
  it('passes a valid central repository and fails a consuming one', () => {
    const central = createTempRepo('central-repo');
    const consumer = createTempRepo('single-package');
    try {
      const passed = spawnSync(process.execPath, [builtCli, 'validate'], {
        cwd: central.root,
        encoding: 'utf8',
      });
      expect(passed.status).toBe(0);
      expect(passed.stdout).toBe('Checked 1 skill: no problems.\n');
      const refused = spawnSync(process.execPath, [builtCli, 'validate'], {
        cwd: consumer.root,
        encoding: 'utf8',
      });
      expect(refused.status).toBe(1);
      expect(refused.stderr).toContain('only runs in the central oak-agent-skills repository');
    } finally {
      central.cleanup();
      consumer.cleanup();
    }
  });
});
