# Oak agent skills

[![Checks on main: whether CI is passing](https://img.shields.io/github/actions/workflow/status/oaknational/oak-agent-skills/ci.yml?branch=main&label=checks&color=0550ae)](https://github.com/oaknational/oak-agent-skills/actions/workflows/ci.yml)
![Status: experimental, internal to Oak](https://img.shields.io/badge/status-experimental-9a6700)
[![Code style: formatted with Prettier](https://img.shields.io/badge/code_style-Prettier-6639ba)](https://prettier.io/)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-0550ae)](LICENSE)

Oak National Academy's shared agent skills, and the `oak-skills` tool that syncs them into a repository.

> [!IMPORTANT]
> The package is being piloted in a few Oak repositories, so expect changes before 1.0.0. It's an experimental internal Oak tool, and we don't support its use outside Oak.

An agent skill is a folder of instructions that a coding agent, such as Claude Code, Codex, Cursor or GitHub Copilot, loads when a task needs it: reviewing a pull request, say, or checking an interface for accessibility. This repository is the one place Oak's skills are written and reviewed, and every Oak repository receives the same versions through the npm package `@oaknational/oak-agent-skills`.

- **Shared skills** live in `skills/central/` and are grouped into profiles, such as `base` for every repository. **Bundles** in `skills/repos/<code>/` hold the skills only one repository needs.
- A repository chooses its profiles in its `package.json`. `oak-skills sync` copies the skills into `.agents/skills/` and links them into `.claude/skills/` for Claude Code, and `oak-skills check` fails CI if a synced skill is edited or out of date.
- Each release reaches a repository as a Dependabot pull request, and a workflow syncs the skills into it.
- An engineer who improves a skill sends the change back here with `oak-skills promote`, which opens a pull request.

## Quick start

In a repository you want to receive the skills, which needs Node 24.22.1 or a later Node 24 and pnpm 10 or 11:

1. Exempt the package from pnpm's release age, in `pnpm-workspace.yaml` at the root. Add it to the list if there is one, or create the file:

   ```yaml
   minimumReleaseAgeExclude:
     - '@oaknational/oak-agent-skills'
   ```

   Do this first. Otherwise pnpm holds back a new release and installs an older version for the first week after each release. pnpm 11 does this even when no release age is set. If the repository already exempts `'@oaknational/*'`, skip this step.

2. At the root, add the package and set it up:

   ```sh
   pnpm add -D @oaknational/oak-agent-skills
   pnpm exec oak-skills init
   ```

   In a pnpm workspace that lists packages, add `--workspace-root` to `pnpm add`, so the package goes in the root `package.json`.

`init` writes the settings, workflows and starter files the repository needs, runs the first sync and lists what it can't do for you. Add `--profile frontend` for a repository with an interface. Review and commit what it wrote. The workflows install the Node version in `package.json`'s `engines.node`, so set it if it's missing. [Subscribing a repository](docs/cli.md#subscribing-a-repository) covers bundles, pnpm workspaces and the GitHub set-up.

## Documentation

- [Skills index](docs/SKILLS_INDEX.md): every skill in the package, the profile or bundle that includes it, and what it does.
- [Using oak-skills](docs/cli.md): subscribing a repository, choosing and syncing skills, checking them in CI, editing and promoting a skill, removing a skill, and releasing.
- [Contributing a skill](docs/contributing-a-skill.md): where a skill belongs, how to write and name it, profiles, vendoring and deprecating skills, changesets, and review.
- [Troubleshooting oak-skills](docs/troubleshooting.md): what each exit code means and how to fix it, and other problems with syncing, Dependabot updates, promoting and skill links.

## Contributing

Oak engineers can propose a skill or a change to one; [how to contribute](CONTRIBUTING.md) explains how, and what we accept from outside Oak. Please report security problems as the [security policy](SECURITY.md) describes.

## Licence

[MIT](LICENSE)
