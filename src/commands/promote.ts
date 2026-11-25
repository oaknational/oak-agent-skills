import { UsageError } from '../lib/errors.ts';
import { ExitCode } from '../lib/exit-codes.ts';
import { CENTRAL_REPO, ghCli } from '../lib/github.ts';
import { SKILL_NAME } from '../lib/manifest.ts';
import { terminalPrompt } from '../lib/prompt.ts';
import { BUMPS, promote as promoteSkill, type Bump } from '../lib/promote.ts';
import { deletedIgnoredWarning } from '../lib/sync.ts';
import type { Command } from './command.ts';

export const promote: Command = {
  name: 'promote',
  summary:
    'Send a local edit to a skill, or a new skill for this repository, to the central repository as a pull request.',
  usage:
    'oak-skills promote <name> [--new [--bundle <code>]] [--bump <patch|minor|major>] [--message <text>] [--dry-run]',
  options: {
    new: { type: 'boolean' },
    bundle: { type: 'string' },
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
    const bundle = typeof values.bundle === 'string' ? values.bundle : undefined;
    if (bundle !== undefined && values.new !== true) {
      throw new UsageError(
        '--bundle only goes with --new, to propose the first skill of a new bundle.',
        'For example: oak-skills promote ora-lint-rules --new --bundle ora',
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
        bundle,
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
      if (result.newBundle !== undefined) {
        output.out(
          `Would add a CODEOWNERS line for skills/repos/${result.newBundle}/ naming the skills maintainers.`,
        );
      }
      output.out(
        values.new === true
          ? `Would then remove the local draft of ${name}.`
          : `Would then restore the synced copy of ${name} here with "oak-skills sync".`,
      );
      if (result.deletedIgnored.length > 0) {
        output.err(`Warning: ${deletedIgnoredWarning(result.deletedIgnored, true)}`);
      }
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
    if (result.deletedIgnored.length > 0) {
      output.err(`Warning: ${deletedIgnoredWarning(result.deletedIgnored, false)}`);
    }
    if (result.newBundle !== undefined) {
      output.out(
        `Once that release is out, set oakSkills.bundle to "${result.newBundle}" in package.json and run "oak-skills sync" to receive it.`,
      );
    }
    return ExitCode.Ok;
  },
};
