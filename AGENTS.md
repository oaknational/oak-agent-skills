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
- Workflow files, including those in `templates/workflows/`: `pnpm workflows` (needs actionlint and zizmor installed). For a stricter pass, run `zizmor --offline --persona=auditor .github`.
- Skills: `pnpm validate` checks every skill against our rules. Given paths, it reports only the skills that hold them, as the pre-commit hook does.
- README skills table: `pnpm readme:skills` regenerates it from the skills and `skills/profiles.json`. `validate` fails if it's out of date.
- Git hooks (installed by `pnpm install`): pre-commit runs Prettier, ESLint, markdownlint, cspell and `validate` on staged files, then gitleaks; commit-msg runs commitlint.
- Pending release notes: `pnpm changeset` adds one; `pnpm changeset:status` checks them. Changes to `skills/`, `templates/` or `src/` need a changeset.
- Run the built tool: `pnpm exec oak-skills --help`

## Layout

- `src/`: the `oak-skills` tool. `src/cli.ts` is the entry point, and `src/run.ts` parses arguments and dispatches to `src/commands/<name>.ts`. Shared code is in `src/lib/`.
- Exit codes are in `src/lib/exit-codes.ts`. Throw `OakSkillsError` from `src/lib/errors.ts` for any failure the user can act on.
- `dist/`: the built tool. It's gitignored, and `pnpm build` empties it first.
- `scripts/`: repository-only scripts, run with `node scripts/<name>.ts`. They never ship.
- `.github/workflows/ci.yml`: every check on PRs and pushes to `main`. `.github/scripts/install-tool.sh` installs pinned tools with checksums.
- `.github/workflows/pr-title.yml`: checks that a PR title is a Conventional Commit, because squash merges turn it into the commit on `main`.
- `.github/workflows/skill-scan.yml`: Cisco skill-scanner on changed skills in PRs and every skill weekly, failing on high severity. Reviewed false positives go in `.github/skill-scanner-policy.yaml`.
- `.github/workflows/coverage-matrix.yml`: weekly, runs `scripts/coverage-matrix.ts` to list the repositories using the package, their versions and settings, and flags to look at.
- `.github/CODEOWNERS`: `skills-maintainers` on every line. `todo-engineers-team` is a placeholder for the all-engineers team, and must be replaced before the first release.
- `.github/pull_request_template.md`: used for every PR, including those `oak-skills promote` opens.
- `test/`: unit, integration and end-to-end tests. `test/helpers/temp-repo.ts` builds temporary git repositories from `test/fixtures/`.

## Rules

- The package has no runtime dependencies. The tool uses only Node's built-in modules, plus `git` and `gh`.
- Support Node 22 and later. Use pnpm, never npm or npx, except where a check names npm.
- Commit messages follow Conventional Commits.
- Write in British English.
- Never add personal data, such as names, usernames or email addresses. Use team handles.
- Keep code comments rare, brief and plain: explain why, not what.
