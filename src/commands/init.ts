import { ExitCode } from '../lib/exit-codes.ts';
import { applyInit, planInit } from '../lib/init.ts';
import { linkPath } from '../lib/shims.ts';
import { hasChanges } from '../lib/sync.ts';
import type { Command } from './command.ts';

export const init: Command = {
  name: 'init',
  summary: 'Set up this repository to receive Oak skills. Only creates what is missing.',
  usage: 'oak-skills init [--bundle <code>] [--dry-run]',
  options: { bundle: { type: 'string' }, 'dry-run': { type: 'boolean' } },
  run: ({ cwd, values, output, packageDir }) => {
    const dryRun = values['dry-run'] === true;
    const bundle = typeof values.bundle === 'string' ? values.bundle : undefined;
    const plan = planInit(cwd, bundle === undefined ? {} : { bundle }, packageDir);
    if (!dryRun) applyInit(plan);

    const verb = (done: string, would: string) => (dryRun ? would : done);
    for (const file of plan.files) {
      output.out(
        file.exists
          ? `Kept ${file.path}, which already exists`
          : `${verb('Created', 'Would create')} ${file.path}`,
      );
    }
    if (plan.addConfig !== undefined) {
      const { profiles, bundle: code } = plan.addConfig;
      output.out(
        `${verb('Added', 'Would add')} oakSkills to package.json: profiles ${JSON.stringify(profiles)}${code === undefined ? '' : `, bundle "${code}"`}`,
      );
    }
    const { sync } = plan;
    const synced = Object.keys(sync.manifest.skills).length;
    output.out(
      hasChanges(sync)
        ? `${verb('Synced', 'Would sync')} ${String(synced)} skill${synced === 1 ? '' : 's'} from version ${sync.version} into .agents/skills/, with links in .claude/skills/.`
        : `The skills are already up to date: ${String(synced)} from version ${sync.version}.`,
    );
    for (const warning of [...plan.warnings, ...sync.warnings]) output.err(`Warning: ${warning}`);
    for (const name of sync.conflicts) {
      output.err(
        `Error: .agents/skills/${name} holds files oak-skills didn't write, so the ${name} skill wasn't synced.`,
      );
    }
    for (const name of sync.links.conflicts) {
      output.err(
        `Error: ${linkPath(name)} is something oak-skills didn't write, so Claude Code can't see the ${name} skill.`,
      );
    }
    for (const name of [
      ...sync.unmanaged.map((n) => `.agents/skills/${n}`),
      ...sync.links.unmanaged.map(linkPath),
    ]) {
      output.err(
        `Note: ${name} wasn't written by oak-skills. Move a skill like this into the central repository with "oak-skills promote --new", or remove it, or "oak-skills check" will fail.`,
      );
    }

    if (plan.toDo.length > 0) {
      output.out('\nTo do, because init never changes files you already have:');
      for (const item of plan.toDo) output.out(`- ${item.replace(/\n/g, '\n  ')}`);
    }
    output.out('\nChecklist:');
    for (const item of plan.checklist) output.out(`- [${item.done ? 'x' : ' '}] ${item.text}`);
    if (dryRun) output.out('\nDry run: nothing was changed.');

    return sync.conflicts.length + sync.links.conflicts.length > 0
      ? ExitCode.Unmanaged
      : ExitCode.Ok;
  },
};
