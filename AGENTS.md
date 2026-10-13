# AGENTS.md

## What this repository is

The central home of Oak National Academy's agent skills. It publishes the npm package `@oaknational/oak-agent-skills`, which holds the skills and the `oak-skills` command-line tool that syncs them into consuming repositories.

## First-iteration build

While the first iteration is being built, agents follow `docs/plans/agent-build-brief.md`. That file and the design documents beside it are kept locally and aren't committed.

## Commands

- Install: `pnpm install`
- Build the tool into `dist/`: `pnpm build`
- Type-check: `pnpm typecheck`
- Test, with coverage: `pnpm test`. It builds `dist/` first, because end-to-end tests run the built command.
- Format: `pnpm format` (check only: `pnpm format:check`)
- Lint TypeScript: `pnpm lint`. Lint Markdown: `pnpm lint:md`
- Spelling, in British English: `pnpm spell`. Add project words to `cspell-words.txt`.
- Internal links and anchors, offline: `pnpm links` (needs lychee installed)
- Run the built tool: `pnpm exec oak-skills --help`

## Layout

- `src/`: the `oak-skills` tool. `src/cli.ts` is the entry point; `src/run.ts` dispatches commands.
- `dist/`: the built tool. It's gitignored.
- `test/`: unit, integration and end-to-end tests. `test/helpers/temp-repo.ts` builds temporary git repositories from `test/fixtures/`.

## Rules

- The package has no runtime dependencies. The tool uses only Node's built-in modules, plus `git` and `gh`.
- Support Node 22 and later. Use pnpm, never npm or npx, except where a check names npm.
- Commit messages follow Conventional Commits.
- Write in British English.
- Never add personal data, such as names, usernames or email addresses. Use team handles.
- Keep code comments rare, brief and plain: explain why, not what.
