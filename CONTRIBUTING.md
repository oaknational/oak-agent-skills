# Contributing

Thank you for your interest in Oak's agent skills. This repository is public so that anyone can read the skills and the `oak-skills` tool, but how you can contribute depends on whether you work at Oak National Academy.

## Are pull requests accepted?

Only from Oak engineers. Every pull request comes from a branch in this repository, so `oak-skills promote` never needs to fork it, and checks that need secrets can always run. We'd rather say so plainly than leave a pull request unanswered.

If you don't work at Oak, you can still help: open a `skill-feedback` issue to report a skill that gave a wrong or unhelpful answer, fired when it shouldn't have, or didn't fire when it should.

Please don't report security vulnerabilities in an issue. Follow [SECURITY.md](SECURITY.md) instead.

## Code of conduct

Everyone taking part in this project is expected to follow the [code of conduct](CODE_OF_CONDUCT.md).

## For Oak engineers

### Setting up

1. Use Node 22.18 or later, and enable Corepack so that `pnpm` runs the version in `package.json`.
2. Install the tools the checks use, which aren't npm packages: gitleaks, lychee, actionlint and zizmor.
3. Run `pnpm install`. It also installs the git hooks, which check each commit.

`AGENTS.md` lists every command, and CI runs the same checks on every pull request.

### Making a change

- Work on a branch and open a pull request against `main`.
- Give the pull request a [Conventional Commit](https://www.conventionalcommits.org/) title, such as `feat(oak-code-review): check for missing tests`. Pull requests are squash-merged, so the title becomes the commit on `main`.
- Add a changeset with `pnpm changeset` if you change `skills/`, `templates/` or `src/`, because those folders ship in the package.
- Never add personal data, such as names, usernames or email addresses, or anything we wouldn't publish on our website. Published versions are public and permanent.
- Keep code comments rare, brief and in plain English, so someone new to the project can follow them. Explain why something is done, not what the code does.
