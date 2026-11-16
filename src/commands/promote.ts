import { UsageError } from '../lib/errors.ts';
import { ExitCode } from '../lib/exit-codes.ts';
import { CENTRAL_REPO, ghCli } from '../lib/github.ts';
import { SKILL_NAME } from '../lib/manifest.ts';
import { terminalPrompt } from '../lib/prompt.ts';
import { BUMPS, promote as promoteSkill, type Bump } from '../lib/promote.ts';
import type { Command } from './command.ts';

export const promote: Command = {
  name: 'promote',
  summary:
    'Send a local edit to a skill, or a new skill for this repository, to the central repository as a pull request.',
  usage:
    'oak-skills promote <name> [--new] [--bump <patch|minor|major>] [--message <text>] [--dry-run]',
  options: {
    new: { type: 'boolean' },
    bump: { type: 'string' },
    message: { type: 'string' },
    'dry-run': { type: 'boolean' },
  },
  allowPositionals: true,
  run: async ({ cwd, values, positionals, output, packageDir, github, prompt, now }) => {
    if (positionals.length !== 1) {
      throw new UsageError(
        'promote needs exactly one skill name.',
        'For example: oak-skills promote oak-tdd',
      );
    }
    const name = positionals[0] ?? '';
    if (!SKILL_NAME.test(name)) {
      throw new UsageError(
        `"${name}" isn't a skill name. Skill names use only lowercase letters, digits and single hyphens.`,
        'For example: oak-skills promote oak-tdd',
      );
    }
    const bump = values.bump;
    if (bump !== undefined && !(BUMPS as readonly unknown[]).includes(bump)) {
      throw new UsageError(`--bump must be patch, minor or major, not "${String(bump)}".`);
    }
    const dryRun = values['dry-run'] === true;
    const result = await promoteSkill(
      {
        cwd,
        github: github ?? ghCli,
        prompt: prompt ?? terminalPrompt(),
        ...(packageDir === undefined ? {} : { packageDir }),
        ...(now === undefined ? {} : { now }),
        log: output.err,
      },
      {
        name,
        isNew: values.new === true,
        bump: bump as Bump | undefined,
        message: typeof values.message === 'string' ? values.message : undefined,
        dryRun,
      },
    );

    if (dryRun) {
      output.out(result.change.trimEnd());
      output.out('');
      output.out(`Would open a pull request in ${CENTRAL_REPO}: "${result.title}"`);
      output.out(`Would add a ${result.bump} changeset, and set metadata.updated to today.`);
      output.out(
        values.new === true
          ? `Would then remove the local draft of ${name}.`
          : `Would then restore the synced copy of ${name} here with "oak-skills sync".`,
      );
      output.out('Dry run: nothing was cloned, opened or changed.');
      return ExitCode.Ok;
    }
    output.out(
      `Opened ${result.conflicted ? 'a draft pull request' : 'a pull request'}: ${String(result.url)}`,
    );
    if (result.conflicted) {
      output.out(
        "The change didn't apply cleanly to main, so the pull request is a draft with the conflict marked. Resolve it there.",
      );
    }
    output.out(
      values.new === true
        ? `Removed the local draft of ${name}. It arrives with the next release once the pull request merges.`
        : `Restored the synced copy of ${name}. Your change arrives with the next release once the pull request merges.`,
    );
    return ExitCode.Ok;
  },
};
