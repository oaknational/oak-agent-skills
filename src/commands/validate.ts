import { ExitCode } from '../lib/exit-codes.ts';
import { findCentralRoot } from '../lib/validate/central-repo.ts';
import { loadDevDependencies } from '../lib/validate/dev-dependencies.ts';
import { validateRepository } from '../lib/validate/repository.ts';
import { compileSchemas } from '../lib/validate/schemas.ts';
import type { Command } from './command.ts';

export const validate: Command = {
  name: 'validate',
  summary: 'Check every skill against our rules. Runs only in the central repository.',
  usage: 'oak-skills validate',
  options: {},
  run: async ({ cwd, output }) => {
    const root = findCentralRoot(cwd);
    const deps = await loadDevDependencies();
    const { skills, problems } = validateRepository(root, deps, compileSchemas(deps));
    for (const problem of problems) output.err(`${problem.file}: ${problem.message}`);
    const checked = `${String(skills.length)} skill${skills.length === 1 ? '' : 's'}`;
    if (problems.length > 0) {
      output.err(
        `\nFound ${String(problems.length)} problem${problems.length === 1 ? '' : 's'} in ${checked}.`,
      );
      return ExitCode.Failure;
    }
    output.out(`Checked ${checked}: no problems.`);
    return ExitCode.Ok;
  },
};
