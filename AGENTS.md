# AGENTS.md

## What this repository is

The central home of Oak National Academy's agent skills. It publishes the npm package `@oaknational/oak-agent-skills`, which holds the skills and the `oak-skills` command-line tool that syncs them into consuming repositories.

## First-iteration build

While the first iteration is being built, agents follow `docs/plans/agent-build-brief.md`. That file and the design documents beside it are kept locally and aren't committed.

## Commands

- Install: `pnpm install`. Developing needs Node 22.18 or later, which runs the TypeScript in `scripts/` directly; the published tool supports Node 22 and later.
- Build the tool into `dist/`: `pnpm build`
- Type-check: `pnpm typecheck`
- Test, with coverage: `pnpm test`. It builds `dist/` first, because end-to-end tests run the built command.
- Format: `pnpm format` (check only: `pnpm format:check`)
- Lint TypeScript: `pnpm lint`. Lint Markdown: `pnpm lint:md`
- Spelling, in British English: `pnpm spell`. Add project words to `cspell-words.txt`.
- Internal links and anchors, offline: `pnpm links` (needs lychee installed)
- Secrets and personal data across the whole git history: `pnpm secrets` (needs gitleaks installed). Rules are in `.gitleaks.toml`.
- Package contents: `pnpm pack:check` (publint, then `npm pack --dry-run`)
- Workflow files: `pnpm workflows` (needs actionlint and zizmor installed). For a stricter pass, run `zizmor --offline --persona=auditor .github`.
- Git hooks (installed by `pnpm install`): pre-commit runs Prettier, ESLint, markdownlint and cspell on staged files, then gitleaks; commit-msg runs commitlint.
- Pending release notes: `pnpm changeset` adds one; `pnpm changeset:status` checks them. Changes to `skills/`, `templates/` or `src/` need a changeset.
- Run the built tool: `pnpm exec oak-skills --help`

## Layout

- `src/`: the `oak-skills` tool. `src/cli.ts` is the entry point; `src/run.ts` dispatches commands.
- `dist/`: the built tool. It's gitignored, and `pnpm build` empties it first.
- `scripts/`: repository-only scripts, run with `node scripts/<name>.ts`. They never ship.
- `.github/workflows/ci.yml`: every check on PRs and pushes to `main`. `.github/scripts/install-tool.sh` installs pinned tools with checksums.
- `.github/workflows/pr-title.yml`: checks that a PR title is a Conventional Commit, because squash merges turn it into the commit on `main`.
- `test/`: unit, integration and end-to-end tests. `test/helpers/temp-repo.ts` builds temporary git repositories from `test/fixtures/`.

## Rules

- The package has no runtime dependencies. The tool uses only Node's built-in modules, plus `git` and `gh`.
- Support Node 22 and later. Use pnpm, never npm or npx, except where a check names npm.
- Commit messages follow Conventional Commits.
- Write in British English.
- Never add personal data, such as names, usernames or email addresses. Use team handles.
- Keep code comments rare, brief and plain: explain why, not what.
