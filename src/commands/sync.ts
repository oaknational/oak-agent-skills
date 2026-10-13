import { ExitCode } from '../lib/exit-codes.ts';
import { linkPath } from '../lib/shims.ts';
import { applySync, hasChanges, planSync, type SyncPlan } from '../lib/sync.ts';
import type { Command, Output } from './command.ts';

function report(plan: SyncPlan, dryRun: boolean, output: Output): void {
  const verb = (done: string, would: string) => (dryRun ? would : done);
  for (const skill of plan.add) output.out(`${verb('Added', 'Would add')} ${skill.name}`);
  for (const skill of plan.update) output.out(`${verb('Updated', 'Would update')} ${skill.name}`);
  for (const name of plan.remove) output.out(`${verb('Removed', 'Would remove')} ${name}`);
  for (const name of [...plan.links.create, ...plan.links.replace]) {
    output.out(`${verb('Linked', 'Would link')} ${linkPath(name)}`);
  }
  for (const name of plan.links.remove)
    output.out(`${verb('Unlinked', 'Would unlink')} ${linkPath(name)}`);

  for (const warning of plan.warnings) output.err(`Warning: ${warning}`);
  if (plan.replacedEdits.length > 0) {
    output.err(
      `Warning: ${verb('replaced', 'would replace')} local edits in ${plan.replacedEdits.join(', ')}. ` +
        'Committed edits are still in git history; use "oak-skills promote" to send an edit upstream.',
    );
  }
  for (const name of plan.unmanaged) {
    output.err(`Note: .agents/skills/${name} wasn't written by oak-skills, so it was left alone.`);
  }
  for (const name of plan.links.unmanaged) {
    output.err(`Note: ${linkPath(name)} wasn't written by oak-skills, so it was left alone.`);
  }
  for (const name of plan.conflicts) {
    output.err(
      `Error: .agents/skills/${name} holds files oak-skills didn't write, so the ${name} skill wasn't synced. ` +
        'Move them into the central repository with "oak-skills promote --new", or remove them, then sync again.',
    );
  }
  for (const name of plan.links.conflicts) {
    output.err(
      `Error: ${linkPath(name)} is something oak-skills didn't write, so Claude Code can't see the ${name} skill. ` +
        'Remove it, then sync again.',
    );
  }

  const count = `${String(Object.keys(plan.manifest.skills).length)} skill${Object.keys(plan.manifest.skills).length === 1 ? '' : 's'}`;
  if (!hasChanges(plan)) {
    output.out(`Already up to date: ${count} from version ${plan.version}.`);
  } else {
    output.out(
      dryRun
        ? `Dry run: nothing was changed. A sync would leave ${count} from version ${plan.version}.`
        : `Synced ${count} from version ${plan.version}.`,
    );
  }
}

export const sync: Command = {
  name: 'sync',
  summary:
    'Write the skills this repository subscribes to into .agents/skills/ and link them for Claude Code.',
  usage: 'oak-skills sync [--dry-run] [--json]',
  options: { 'dry-run': { type: 'boolean' }, json: { type: 'boolean' } },
  run: ({ cwd, values, output, packageDir }) => {
    const dryRun = values['dry-run'] === true;
    const plan = planSync(cwd, packageDir);
    if (!dryRun) applySync(plan);

    if (values.json === true) {
      output.out(
        JSON.stringify(
          {
            dryRun,
            version: plan.version,
            changed: hasChanges(plan),
            added: plan.add.map((skill) => skill.name),
            updated: plan.update.map((skill) => skill.name),
            removed: plan.remove,
            unchanged: plan.unchanged,
            links: {
              created: [...plan.links.create, ...plan.links.replace],
              removed: plan.links.remove,
            },
            replacedEdits: plan.replacedEdits,
            unmanaged: [
              ...plan.unmanaged.map((n) => `.agents/skills/${n}`),
              ...plan.links.unmanaged.map(linkPath),
            ],
            conflicts: [
              ...plan.conflicts.map((n) => `.agents/skills/${n}`),
              ...plan.links.conflicts.map(linkPath),
            ],
            warnings: plan.warnings,
          },
          null,
          2,
        ),
      );
    } else {
      report(plan, dryRun, output);
    }
    return plan.conflicts.length + plan.links.conflicts.length > 0
      ? ExitCode.Unmanaged
      : ExitCode.Ok;
  },
};
