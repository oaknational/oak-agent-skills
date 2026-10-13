import { describe, expect, it, vi } from 'vitest';
import type { Command } from '../src/commands/command.ts';
import { OakSkillsError } from '../src/lib/errors.ts';
import { ExitCode } from '../src/lib/exit-codes.ts';
import { readPackageInfo } from '../src/lib/package-info.ts';
import { run, usage } from '../src/run.ts';
import { capture } from './helpers/capture.ts';

function fakeCommand(overrides: Partial<Command> = {}): Command {
  return {
    name: 'fake',
    summary: 'Does something fake',
    usage: 'oak-skills fake [--dry-run] [--name <text>]',
    options: { 'dry-run': { type: 'boolean' }, name: { type: 'string' } },
    run: () => ExitCode.Ok,
    ...overrides,
  };
}

async function runWith(args: string[], commands: Command[] = [fakeCommand()], cwd?: string) {
  const captured = capture();
  const code = await run(args, captured.output, {
    commands,
    ...(cwd === undefined ? {} : { cwd }),
  });
  return { code, out: captured.out(), err: captured.err() };
}

describe('run', () => {
  it.each(['--version', '-v'])('prints the package version for %s', async (flag) => {
    expect(await runWith([flag])).toEqual({ code: 0, out: readPackageInfo().version, err: '' });
  });

  it.each([[], ['--help'], ['-h']])(
    'prints usage listing every command for %j',
    async (...args) => {
      const result = await runWith(args, [
        fakeCommand(),
        fakeCommand({ name: 'longer-name', summary: 'Another' }),
      ]);
      expect(result.code).toBe(0);
      expect(result.out).toContain('Usage: oak-skills <command> [options]');
      expect(result.out).toContain('  fake         Does something fake');
      expect(result.out).toContain('  longer-name  Another');
    },
  );

  it('uses the real commands by default', async () => {
    const captured = capture();
    expect(await run(['--help'], captured.output)).toBe(0);
    expect(captured.out()).toContain('Commands:');
  });

  it('rejects an unknown command with the usage exit code and a hint', async () => {
    const result = await runWith(['not-a-command']);
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.out).toBe('');
    expect(result.err).toBe(
      'oak-skills: Unknown command: not-a-command\nRun "oak-skills --help" to list the commands.',
    );
  });

  it.each(['--help', '-h'])("prints a command's usage for %s without running it", async (flag) => {
    const commandRun = vi.fn(() => ExitCode.Ok);
    const result = await runWith(['fake', '--dry-run', flag], [fakeCommand({ run: commandRun })]);
    expect(result).toEqual({
      code: 0,
      out: 'Usage: oak-skills fake [--dry-run] [--name <text>]\n\nDoes something fake',
      err: '',
    });
    expect(commandRun).not.toHaveBeenCalled();
  });

  it('passes parsed options, positionals and the working folder to the command', async () => {
    const commandRun = vi.fn(() => Promise.resolve(3));
    const result = await runWith(
      ['fake', 'skill-a', '--dry-run', '--name', 'value'],
      [fakeCommand({ allowPositionals: true, run: commandRun })],
      '/some/folder',
    );
    expect(result.code).toBe(3);
    expect(commandRun).toHaveBeenCalledWith(
      expect.objectContaining({
        values: { 'dry-run': true, name: 'value' },
        positionals: ['skill-a'],
        cwd: '/some/folder',
      }),
    );
  });

  it('defaults the working folder to the process', async () => {
    const commandRun = vi.fn(() => ExitCode.Ok);
    await runWith(['fake'], [fakeCommand({ run: commandRun })]);
    expect(commandRun).toHaveBeenCalledWith(expect.objectContaining({ cwd: process.cwd() }));
  });

  it.each([
    ['an unknown option', ['fake', '--nope'], /Unknown option '--nope'/],
    ['a missing option value', ['fake', '--name'], /--name/],
    ['a positional the command does not take', ['fake', 'extra'], /Unexpected argument 'extra'/],
  ])('treats %s as a usage error', async (_label, args, message) => {
    const result = await runWith(args);
    expect(result.code).toBe(ExitCode.Usage);
    expect(result.err).toMatch(message);
    expect(result.err).toContain('Run "oak-skills fake --help" for its options.');
  });

  it("prints an OakSkillsError's message and hint and returns its exit code", async () => {
    const result = await runWith(
      ['fake'],
      [
        fakeCommand({
          run: () => {
            throw new OakSkillsError('No oakSkills in package.json', {
              exitCode: ExitCode.Configuration,
              hint: 'Run oak-skills init.',
            });
          },
        }),
      ],
    );
    expect(result).toEqual({
      code: ExitCode.Configuration,
      out: '',
      err: 'oak-skills: No oakSkills in package.json\nRun oak-skills init.',
    });
  });

  it('prints an OakSkillsError without a hint on one line', async () => {
    const result = await runWith(
      ['fake'],
      [fakeCommand({ run: () => Promise.reject(new OakSkillsError('Nope')) })],
    );
    expect(result).toEqual({ code: ExitCode.Failure, out: '', err: 'oak-skills: Nope' });
  });

  it('reports an unexpected error as a bug with the internal exit code', async () => {
    const result = await runWith(
      ['fake'],
      [
        fakeCommand({
          run: () => {
            throw new TypeError('boom');
          },
        }),
      ],
    );
    expect(result.code).toBe(ExitCode.Internal);
    expect(result.err).toContain('oak-skills: unexpected error: TypeError: boom');
    expect(result.err).toContain('This is a bug in oak-skills.');
  });

  it('reports a thrown value that is not an Error', async () => {
    const result = await runWith(
      ['fake'],
      // A dependency could reject with anything, so the tool must cope with a non-Error.
      // eslint-disable-next-line @typescript-eslint/prefer-promise-reject-errors
      [fakeCommand({ run: () => Promise.reject('a string') })],
    );
    expect(result.code).toBe(ExitCode.Internal);
    expect(result.err).toContain('oak-skills: unexpected error: a string');
  });
});

describe('usage', () => {
  it('copes with no commands', () => {
    expect(usage([])).toContain('Commands:\n\nOptions:');
  });
});
