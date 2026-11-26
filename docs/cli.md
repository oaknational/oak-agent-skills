# Using oak-skills

`oak-skills` is the command-line tool in the `@oaknational/oak-agent-skills` package. A consuming repository uses it to receive Oak's agent skills, keep them up to date, and send improvements back to the central repository.

Run it with `pnpm exec`, from anywhere in the repository:

```sh
pnpm exec oak-skills <command> [options]
```

Every command finds the repository root with git and acts there, whichever folder you run it from. In a pnpm workspace, the packages in folders such as `apps/` and `packages/` are never touched: the skills, the settings and the manifest all live at the root.

Run `pnpm exec oak-skills --help` to list the commands, `pnpm exec oak-skills <command> --help` for a command's options, and `pnpm exec oak-skills --version` for the version installed.

## Subscribing a repository

To start receiving Oak's skills, first exempt the package from pnpm's release age. Add it to `minimumReleaseAgeExclude` in the root `pnpm-workspace.yaml`, creating the file if there isn't one:

```yaml
minimumReleaseAgeExclude:
  - '@oaknational/oak-agent-skills'
```

Do this before installing. pnpm holds back versions published too recently, even when no release age is set in pnpm 11. Without the exemption, `pnpm add` installs an older version for the first week after each release, and `pnpm exec` refuses to run while the lockfile holds a version that's too new. If the repository already exempts `'@oaknational/*'`, there's nothing to add.

Then add the package as a dev dependency at the repository root, and run `init`:

```sh
pnpm add -D @oaknational/oak-agent-skills
pnpm exec oak-skills init --bundle <code> --dry-run
pnpm exec oak-skills init --bundle <code>
```

In a pnpm workspace whose `pnpm-workspace.yaml` lists packages, add `--workspace-root` to `pnpm add` so the package goes in the root `package.json`. Leave out `--bundle` if the repository has no bundle of its own skills in the central repository yet.

### What init does

`init` only creates what's missing, and never overwrites a file. It:

1. writes a starter `AGENTS.md`, about 100 lines of orientation for agents, for your team to fill in;
2. writes `CLAUDE.md` holding `@AGENTS.md`, so Claude Code reads the same file;
3. writes two workflows: `.github/workflows/oak-skills-check.yml`, which runs `oak-skills check` on every pull request, and `.github/workflows/oak-skills-sync.yml`, which syncs the skills on Dependabot's update pull requests;
4. writes `.github/dependabot.yml`, checking npm daily with the skills package in a group of its own;
5. adds `oakSkills` to the root `package.json`, with the `base` profile, any profiles you named with `--profile`, and the bundle you named;
6. runs the first sync.

Run it with `--dry-run` first to see what it would do without changing anything.

| Option             | What it does                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `--profile <name>` | Also receives this profile, on top of `base`, such as `--profile frontend`. Repeat it for more than one profile. |
| `--bundle <code>`  | Receives your repository's bundle of skills, such as `--bundle owa`.                                             |
| `--dry-run`        | Shows what `init` would do, and changes nothing.                                                                 |

The options only apply when `package.json` has no `oakSkills` settings yet. Otherwise `init` leaves the settings alone, warns if an option differs from them, and you change them by hand.

### Files you already have

When a file already exists, `init` leaves it alone and prints what to add to it instead:

- **`CLAUDE.md`**: add a line holding just `@AGENTS.md` at the top.
- **`.github/dependabot.yml`**: give `@oaknational/oak-agent-skills` a group of its own in the npm update for the repository root, listed before any group that would also take it, so its updates are never bundled with others. Dependabot puts a package in the first group that matches it.
- **A group that takes every package**, such as one with the pattern `*`, one with no `patterns`, or a security-update group: `init` names each one, and asks you to add the package to its `exclude-patterns`. Security updates never use a version-update group, so a security catch-all needs this even when the package has its own group.
- **A Dependabot `cooldown`** in the npm update: exempt the package in its `exclude` list, or every skills release waits out the cooldown. Cooldowns in other updates, such as `github-actions`, don't affect the package.
- **pnpm's `minimumReleaseAge`** in `pnpm-workspace.yaml`: add the package to `minimumReleaseAgeExclude`, for the same reason.
- **`.prettierignore`**, when the repository has Prettier settings: if your Prettier check covers Markdown or JSON, add `.agents/skills/`. Otherwise Prettier rewrites the synced files, and `check` reports them as edited. Prettier doesn't follow the `.claude/skills` links, so that one line is enough.
- **`.gitignore`**, when it ignores `.agents/skills/` or `.claude/skills/`, for example with a `.claude/` line: change the rule so git keeps the skill folders, such as `.claude/*` followed by `!.claude/skills/`. Otherwise what `sync` writes isn't committed, and `check` fails in every fresh clone.

### Before the first update arrives

`init` finishes with a checklist of things it can't do for you:

- The organisation's Oak Agent Skills GitHub App is installed on the repository. The sync workflow pushes with its token, so that required checks run again on the sync commit.
- The organisation Dependabot secrets `OAK_SKILLS_APP_CLIENT_ID` and `OAK_SKILLS_APP_KEY` are available to the repository.
- `package.json` has a `packageManager` field naming pnpm, which the workflows use to install the right version.
- `package.json` has an `engines.node` field, which the workflows read to set up Node.
- `oak-skills check` is a required status check, so an edited or out-of-date skill can't merge. Making it one needs a repository admin, or a custom role that can edit repository rules.

Then review and commit what `init` wrote, including `.agents/skills/` and `.claude/skills/`, and fill in `AGENTS.md` with your team.

## Syncing and updating

`oak-skills sync` writes the skills your repository subscribes to into `.agents/skills/`, and links each one into `.claude/skills/` so Claude Code can see it too. Commit both folders, so every clone has the skills.

### Choosing your skills

Your repository chooses its skills in the `oakSkills` settings of its root `package.json`:

```json
{
  "oakSkills": {
    "profiles": ["base", "frontend"],
    "bundle": "owa",
    "include": [],
    "exclude": []
  }
}
```

| Setting    | What it does                                                                                                                                         |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles` | The named groups of shared skills to receive, such as `base`, which every repository should have, and `frontend` for repositories with an interface. |
| `bundle`   | Your repository's code, such as `owa`. You receive every skill in its bundle. Leave it out if your repository has no bundle.                         |
| `include`  | Extra shared skills to receive, beyond your profiles.                                                                                                |
| `exclude`  | Shared skills to leave out, even though a profile includes them.                                                                                     |

`include` and `exclude` only adjust shared skills. To drop one of your own bundle's skills, remove it in the central repository.

A typo can't silently drop a skill: an unknown profile, bundle or skill name stops `sync` with exit code 5 and changes nothing. Excluding a skill that none of your profiles includes gives a warning, because it has no effect.

### When to sync

- **On a Dependabot pull request** that bumps `@oaknational/oak-agent-skills`, the `oak-skills-sync.yml` workflow runs `sync` and commits the result to the pull request for you.
- **After changing `oakSkills`**, run `pnpm exec oak-skills sync` yourself and commit the result.
- **After pinning or rolling back a version** of the package, run it to match the skills to that version.

### What sync changes

`sync` only changes what it manages:

- the skill folders it wrote in `.agents/skills/`;
- the links it made in `.claude/skills/`;
- `.agents/skills/.oak-manifest.json`, which records the package version, your settings, a checksum for every synced file and the links.

It adds skills you now subscribe to, updates those that changed in the version you have installed, and removes those you no longer subscribe to. Running it twice changes nothing the second time.

It never touches anything else:

- **Something it didn't write** in `.agents/skills/` or `.claude/skills/` is left alone, with a note.
- **A folder it didn't write with the name of a skill you subscribe to** blocks that skill. `sync` skips it, reports it and exits with code 4. Move the folder's contents into the central repository with `oak-skills promote --new`, or remove it, then sync again.
- **Local edits to a synced skill are replaced**, with a warning naming each file. Edits that are committed are still in git history. To keep an improvement, send it to the central repository with `oak-skills promote` first.
- **Files git ignores inside a skill**, such as a `.DS_Store`, are left alone while the skill is unchanged. When `sync` replaces or removes the skill, they go with it, and `sync` names each one, because git has no copy.

### Options

| Option      | What it does                                                                                                                                                                                                                                                |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dry-run` | Prints what `sync` would add, update, remove and link, and changes nothing.                                                                                                                                                                                 |
| `--json`    | Prints the result as JSON, for scripts: the skills added, updated, removed and unchanged, the links created and removed, replaced edits, deleted files git ignores, unmanaged entries, conflicts and warnings. Combine it with `--dry-run` to see the plan. |

### Exit codes

| Code | Meaning                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 0    | The sync succeeded, or a dry run found nothing in the way.                                                                                                   |
| 4    | Something `oak-skills` didn't write blocks a skill or its link.                                                                                              |
| 5    | A configuration problem: unknown names in `oakSkills`, no `oakSkills` settings, no root `package.json`, or not inside a git repository. Nothing was changed. |
| 64   | The command line itself was wrong, such as an unknown option.                                                                                                |
| 70   | A bug in `oak-skills`. Please report it in a `skill-feedback` issue in the central repository.                                                               |

## Checking the skills

The synced skills are read-only in a consuming repository: the lockfile pins the package, but agents read the committed copies, so a checksum check protects them. Two commands report on them without changing anything.

### oak-skills status

`pnpm exec oak-skills status` reports the state of every synced skill: which are clean, which files were edited, whether the skills are out of date, and anything in the skill folders that `oak-skills` didn't write. Add `--json` for machine-readable output, for scripts and agents.

### oak-skills check

`pnpm exec oak-skills check` uses the same logic for CI. It fails on anything that isn't clean, names the fix, and links to the [troubleshooting guide](troubleshooting.md). It also checks the size of the repository's `AGENTS.md` files: it warns when one passes about 100 lines, and fails when the files on any path from the root to a folder together pass 32 KiB, because Codex counts them against one budget.

`check` needs the package installed, because that's how it runs, but no network access: it compares the manifest with its own version.

### Running check in CI

`oak-skills init` adds `.github/workflows/oak-skills-check.yml`, which installs dependencies and runs `check` on every pull request. Make it a required check, so an edited or out-of-date skill can't merge.

In a large repository, you can avoid a second install by adding `check` as a step to a job in your existing CI that has already installed dependencies:

```yaml
- name: Check the synced agent skills
  run: pnpm exec oak-skills check
```

You can also add `pnpm exec oak-skills check` to your own pre-commit hook for earlier warning. `oak-skills init` doesn't install hooks.

## Editing a skill

Synced skills are read-only here, but improving them is welcome: a local edit often means the central skill is wrong or incomplete. `oak-skills promote` turns your edit into a pull request against the central repository, attributed to your repository, so the improvement reaches everyone.

1. Edit the skill in `.agents/skills/<name>/`, and try it out.
2. Preview the change: `pnpm exec oak-skills promote <name> --dry-run`.
3. Promote it: `pnpm exec oak-skills promote <name>`.

`promote` first checks that `gh` is ready and that you can push to the central repository, so it never asks you anything it can't act on. It asks why you made the change and which version bump it needs, or takes them from `--message` and `--bump`. Then it:

1. clones the central repository with your own `gh` login, and creates a branch from `main`;
2. applies your change, taken against the release your copy came from, with a three-way merge, so it still applies if the skill has changed since. Files git ignores stay out of it, as they do from `check`;
3. sets the skill's `metadata.updated` to today, and adds a changeset;
4. opens a pull request with a [Conventional Commit](https://www.conventionalcommits.org/) title and the template filled in, including an `Originating-Repo:` line naming your repository. If the merge conflicted, the pull request is a draft with the conflict marked, for a reviewer to resolve. If GitHub won't open the pull request, `promote` deletes the branch it pushed and changes nothing here;
5. restores the synced copy here with `oak-skills sync`, so your own pull request passes `oak-skills check`, and names any file git ignores that this deletes.

Your improvement arrives with the next release, through the usual Dependabot pull request.

### Proposing a new skill

To propose a skill for your repository's bundle, draft it in `.agents/skills/<name>/` or `.claude/skills/<name>/`, then run `pnpm exec oak-skills promote <name> --new`. The name must start with your repository's code, such as `owa-`, and `oakSkills` must name the bundle. `promote` proposes the whole folder for `skills/repos/<code>/`, apart from files git ignores, then removes the local draft, naming any ignored files that go with it. If there's a draft in both folders, they must be the same apart from files git ignores, or `promote` stops and asks you to keep one. Follow the [guide to contributing a skill](contributing-a-skill.md) when you write it.

#### The first skill of a new bundle

If your repository has no bundle yet, ask the skills maintainers for its code, two to four lowercase letters, then pass it with `--bundle`:

```sh
pnpm exec oak-skills promote ora-lint-rules --new --bundle ora
```

`promote` proposes the skill for `skills/repos/<code>/`, adds a line for that folder to the central repository's `CODEOWNERS`, naming the skills maintainers, and adds the code to its `cspell-words.txt`. Add your team to the `CODEOWNERS` line in the pull request. Once a release includes the skill, set `oakSkills.bundle` to the code and run `pnpm exec oak-skills sync` to receive it. `--bundle` only applies while `oakSkills` names no bundle, and only to a code the installed version doesn't have yet.

### Choosing the version bump

| Bump    | When                                                                                      |
| ------- | ----------------------------------------------------------------------------------------- |
| `patch` | Wording changes that don't change when the skill fires. The default for an edit.          |
| `minor` | A new skill, or a change to when a repository's own skill fires. The default for `--new`. |
| `major` | A shared skill removed or renamed, or a change to what its description fires on           |

Until version 1.0.0, a major change is recorded as minor in the changeset, because Changesets would otherwise release 1.0.0, but its title still marks it as breaking with `!`.

### What promote needs

- `git`, and the GitHub CLI `gh` signed in with `gh auth login`.
- Write access to the central repository, which every Oak engineer has. If you don't work at Oak, raise a `skill-feedback` issue there instead.
- Skills that are otherwise clean and up to date: `oak-skills status` reporting only local edits. If the installed version has changed since the last sync, promote from the version the skills came from first, because syncing would replace your edit.

### Options

| Option                         | What it does                                                                                                                             |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `--new`                        | Proposes a drafted skill for your repository's bundle, rather than an edit to a synced one.                                              |
| `--bundle <code>`              | With `--new`, proposes the first skill of a new bundle, when `oakSkills` names no bundle yet.                                            |
| `--bump <patch\|minor\|major>` | The version bump the change needs, instead of being asked.                                                                               |
| `--message <text>`             | Why you made the change, used for the title, the changeset and the pull request. Without a terminal, such as in a script, it's required. |
| `--dry-run`                    | Prints the change and what `promote` would do, without cloning, opening or changing anything.                                            |

### Personal skills

Skills you want only for yourself belong in `~/.claude/skills/` or `~/.agents/skills/` on your own machine, not in a repository. Don't give them the `oak-` prefix: in Claude Code, a personal skill overrides a project skill with the same name.

## Removing a skill

How you remove a skill depends on whose it is:

- **A shared skill your repository doesn't want:** add its name to `exclude` in `oakSkills`, or take it out of `include`, then run `pnpm exec oak-skills sync` and commit the result. `sync` deletes the skill's folder and its Claude Code link. Other repositories keep it.
- **A skill in your repository's bundle:** remove it from `skills/repos/<code>/` in the central repository, with a changeset. The next release removes it when your repository syncs.
- **A shared skill, for every repository:** deprecate it first, then remove it after the waiting period, as the [guide to contributing a skill](contributing-a-skill.md#deprecate-a-skill) explains. Removing a shared skill is a breaking change.

`sync` removes a skill even if you've edited it, and warns you, naming each edited file. To keep an improvement, send it to the central repository with `oak-skills promote` first.

## Validating skills in the central repository

`oak-skills validate` checks every skill against the rules in the [guide to contributing a skill](contributing-a-skill.md). It only runs in the central repository, where `pnpm validate` runs it; anywhere else it stops with exit code 1 and suggests `oak-skills check` instead. Given paths, such as `oak-skills validate skills/central/oak-tdd/SKILL.md`, it reports only the skills that hold them, as the pre-commit hook does.

## Releasing

This section is for the skills maintainer, who releases weekly, and whenever a fix can't wait. A release is one merge; the publish workflow, `.github/workflows/publish.yml`, does the rest.

1. Changesets merged to `main` wait there. On every push to `main`, the publish workflow opens or updates a pull request titled `chore: version packages`. It sets the new version in `package.json`, adds the changesets' summaries to `CHANGELOG.md` and deletes the changesets. Its checks run like any other pull request's.
2. Check the version and the changelog, then merge the pull request.
3. The merge starts the publish workflow again. The version on `main` isn't on npm yet, so the workflow packs the release, runs the publish gates on it and, if they all pass, publishes that tarball to npm. It then tags the commit `v<version>` and creates a GitHub release, whose notes Dependabot shows in each consuming repository's update.

The gates run immediately before publishing, because a published version can never be withdrawn:

| Gate                           | Fails when                                                                                                                                                                                                                                                                                    |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Secrets and personal data      | gitleaks finds a secret, an email address or a phone number anywhere in the git history                                                                                                                                                                                                       |
| Skill scan                     | Cisco skill-scanner finds a high-severity problem in any skill                                                                                                                                                                                                                                |
| `validate`, tests, build       | Any of them fails, as in CI                                                                                                                                                                                                                                                                   |
| publint                        | `package.json` describes the package wrongly, such as a `bin` file that isn't built                                                                                                                                                                                                           |
| Package contents               | The tarball holds anything outside `skills/`, `templates/` and `dist/` other than `package.json`, `README.md`, `CHANGELOG.md` and `LICENSE`; misses `CHANGELOG.md` or a file the tool needs; has an install script or runtime dependencies; or contains the `todo-engineers-team` placeholder |
| Placeholder team in CODEOWNERS | `.github/CODEOWNERS` still names `todo-engineers-team`                                                                                                                                                                                                                                        |

Run the package gates locally with `pnpm publish:gate`. It builds, packs the package as Changesets does, and checks the tarball.

If a gate fails, nothing is published. Fix the problem on `main`: the next push tries again. If the fix itself needs a changeset, the version pull request comes back with the next version instead.

The workflow publishes with [npm trusted publishing](https://docs.npmjs.com/trusted-publishers), so there's no npm token to store or leak. The trusted publisher accepts only a job in the `release` environment, which only `main` can use, so a copy of the workflow on another branch can't publish. Each release carries a provenance attestation linking it to the workflow run that built it. To check one:

```sh
npm view @oaknational/oak-agent-skills@<version> dist.attestations
```

To compare a tarball you packed locally with the published one, compare the unpacked files, not the `integrity` hash. A gzip header records the operating system that made it, so a pack made on macOS never matches the workflow's Linux pack byte for byte, even when every file is the same.

### When a bad version is published

A published version can't be deleted or reused. Instead:

1. Deprecate it, so installing it shows a warning: `npm deprecate @oaknational/oak-agent-skills@<version> "<why, and which version to use instead>"`. This needs an npm account with publish rights to the package.
2. Fix the problem and release a new version.
3. If a secret was published, rotate it straight away. Assume it has already been copied.

## Exit codes

`status` and `check` use the same exit codes. When several apply, the highest wins: a configuration problem makes the other results unreliable, so fix it first. The [troubleshooting guide](troubleshooting.md#exit-codes) explains each one.

| Code | Meaning                                                                                                                                                                             | What to do                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 0    | Clean                                                                                                                                                                               | Nothing                                                                                |
| 1    | A synced skill was edited locally                                                                                                                                                   | Run `oak-skills promote`, or revert the edit                                           |
| 2    | Out of date: the skills were synced from a different version from the one installed, `oakSkills` has changed since the last sync, or `.agents/skills/.oak-manifest.json` is missing | Run `oak-skills sync`                                                                  |
| 3    | Both: edited locally, and out of date                                                                                                                                               | Promote or revert, then sync                                                           |
| 4    | Something in `.agents/skills/` or `.claude/skills/` that `oak-skills` didn't write                                                                                                  | Move a skill into the central repository with `oak-skills promote --new`, or remove it |
| 5    | A configuration problem, such as an unknown profile, skill or bundle in `oakSkills`                                                                                                 | Fix `package.json`                                                                     |
| 6    | `check` only: the `AGENTS.md` files on one path together pass 32 KiB                                                                                                                | Shorten them, and move how-to guidance into skills                                     |

Every command also uses these:

| Code | Meaning                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------- |
| 64   | The command line itself was wrong, such as an unknown option                                   |
| 70   | A bug in `oak-skills`. Please report it in a `skill-feedback` issue in the central repository. |
