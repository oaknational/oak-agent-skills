# Oak agent skills

[![Checks on main: whether CI is passing](https://img.shields.io/github/actions/workflow/status/oaknational/oak-agent-skills/ci.yml?branch=main&label=checks&color=0550ae)](https://github.com/oaknational/oak-agent-skills/actions/workflows/ci.yml)
[![Status: pre-release, not yet published](https://img.shields.io/badge/status-pre--release-9a6700)](#status)
[![Code style: formatted with Prettier](https://img.shields.io/badge/code_style-Prettier-6639ba)](https://prettier.io/)
[![Licence: MIT](https://img.shields.io/badge/licence-MIT-0550ae)](LICENSE)

Oak National Academy's shared agent skills, and the `oak-skills` tool that syncs them into a repository.

An agent skill is a folder of instructions that a coding agent, such as Claude Code, Codex, Cursor or GitHub Copilot, loads when a task needs it: reviewing a pull request, say, or checking an interface for accessibility. This repository is the one place Oak's skills are written and reviewed, and every Oak repository receives the same versions through the npm package `@oaknational/oak-agent-skills`.

- **Shared skills** live in `skills/central/` and are grouped into profiles, such as `base` for every repository. **Bundles** in `skills/repos/<code>/` hold the skills only one repository needs.
- A repository chooses its profiles in its `package.json`. `oak-skills sync` copies the skills into `.agents/skills/` and links them into `.claude/skills/` for Claude Code, and `oak-skills check` fails CI if a synced skill is edited or out of date.
- Each release reaches a repository as a Dependabot pull request, and a workflow syncs the skills into it.
- An engineer who improves a skill sends the change back here with `oak-skills promote`, which opens a pull request.

## Status

This package is being built and hasn't been released yet. The first release will be 0.1.0, followed by a pilot in a few Oak repositories.

## Quick start

In a repository you want to receive the skills, which needs Node 22 or later and pnpm 10 or 11, run this at the root:

```sh
pnpm add -D @oaknational/oak-agent-skills
pnpm exec oak-skills init
```

`init` writes the settings, workflows and starter files the repository needs, runs the first sync and lists what it can't do for you. Review and commit what it wrote. [Subscribing a repository](docs/cli.md#subscribing-a-repository) covers bundles, pnpm workspaces and the GitHub set-up.

## Skills

<!-- prettier-ignore-start -->
<!-- skills-table:start -->
| Skill | Profile or bundle | What it does |
| --- | --- | --- |
| [`oak-accessibility-review`](skills/central/oak-accessibility-review/SKILL.md) | `frontend` | Builds and reviews interface code to meet WCAG 2.2 AA, with Oak's 7:1 contrast target, including the criteria automated checkers miss. Use when building or reviewing components, pages, forms, quizzes or embedded media, or when asked whether something is accessible, to audit accessibility, or to check keyboard support, focus, contrast, alt text, labels, captions or target size. |
| [`oak-code-review`](skills/central/oak-code-review/SKILL.md) | `base` | Reviews a code change for correctness, design, risk and test coverage, and reports findings ranked by how much they matter. Use when asked to review a pull request, a branch, a diff or staged changes, or to check work before it's merged. |
| [`oak-pr-create`](skills/central/oak-pr-create/SKILL.md) | `base` | Writes a pull request title and description that explain what a change does and why, with steps to test it, then opens or updates the pull request once the user approves them. Use when opening, creating or updating a pull request, or when asked to write or improve a PR title, description or testing instructions. |
| [`oak-security-review`](skills/central/oak-security-review/SKILL.md) | `base` | Threat-models a code change for security, covering authorisation, input handling, secrets and dependencies, and keeping personal data and secrets out of code, logs and errors. Use when a change touches sign-in, permissions, user input, data access, APIs, configuration, logging, dependencies or CI workflows, or when asked for a security review. |
| [`oak-sos-draft`](skills/central/oak-sos-draft/SKILL.md) | `base` | Drafts a squad's Scrum of Scrums update from its Linear activity, checked against the previous meeting's notes, covering accomplishments, upcoming goals, cross-team dependencies and risks. Use when asked to write, prepare or draft a Scrum of Scrums report, update or notes. |
<!-- skills-table:end -->
<!-- prettier-ignore-end -->

## Documentation

The [guides](docs/README.md) cover using `oak-skills`, contributing a skill, and troubleshooting.

## Contributing

Oak engineers can propose a skill or a change to one; [how to contribute](CONTRIBUTING.md) explains how, and what we accept from outside Oak. Please report security problems as the [security policy](SECURITY.md) describes.

## Licence

[MIT](LICENSE)
