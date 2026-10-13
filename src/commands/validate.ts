import { relative, resolve, sep } from 'node:path';
import { ExitCode } from '../lib/exit-codes.ts';
import { findCentralRoot } from '../lib/validate/central-repo.ts';
import { loadDevDependencies } from '../lib/validate/dev-dependencies.ts';
import type { Problem } from '../lib/validate/problem.ts';
import { validateRepository } from '../lib/validate/repository.ts';
import { compileSchemas } from '../lib/validate/schemas.ts';
import type { Command } from './command.ts';

const plural = (count: number, word: string) => `${String(count)} ${word}${count === 1 ? '' : 's'}`;

export const validate: Command = {
  name: 'validate',
  summary: 'Check every skill against our rules. Runs only in the central repository.',
  usage: 'oak-skills validate [path...]',
  options: {},
  allowPositionals: true,
  run: async ({ cwd, output, positionals }) => {
    const root = findCentralRoot(cwd);
    const deps = await loadDevDependencies();
    const { skills, problems } = validateRepository(root, deps, compileSchemas(deps));

    // Given paths, as the pre-commit hook passes, report only the skills that contain them,
    // plus problems that belong to the repository as a whole.
    let reported: Problem[] = problems;
    if (positionals.length > 0) {
      const paths = positionals.map((path) =>
        relative(root, resolve(cwd, path)).split(sep).join('/'),
      );
      const skillPaths = skills.map((skill) => skill.location.path);
      const selected = skillPaths.filter((skillPath) =>
        paths.some((path) => path === skillPath || path.startsWith(`${skillPath}/`)),
      );
      const inSkill = (file: string, skillPath: string) =>
        file === skillPath || file.startsWith(`${skillPath}/`);
      reported = problems.filter(
        (problem) =>
          !skillPaths.some((skillPath) => inSkill(problem.file, skillPath)) ||
          selected.some((skillPath) => inSkill(problem.file, skillPath)),
      );
    }

    for (const problem of reported) output.err(`${problem.file}: ${problem.message}`);
    const checked = plural(skills.length, 'skill');
    if (reported.length > 0) {
      output.err(`\nFound ${plural(reported.length, 'problem')} in ${checked}.`);
      return ExitCode.Failure;
    }
    output.out(`Checked ${checked}: no problems.`);
    return ExitCode.Ok;
  },
};
