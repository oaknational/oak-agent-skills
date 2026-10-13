# Using oak-skills

`oak-skills` is the command-line tool in the `@oaknational/oak-agent-skills` package. A consuming repository uses it to receive Oak's agent skills, keep them up to date, and send improvements back to the central repository.

Run it with `pnpm exec`, from anywhere in the repository:

```sh
pnpm exec oak-skills <command> [options]
```

Every command finds the repository root with git and acts there, whichever folder you run it from. In a pnpm workspace, the packages in folders such as `apps/` and `packages/` are never touched: the skills, the settings and the manifest all live at the root.

Run `pnpm exec oak-skills --help` to list the commands, and `pnpm exec oak-skills <command> --help` for a command's options.

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

### Options

| Option      | What it does                                                                                                                                                                                                                     |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--dry-run` | Prints what `sync` would add, update, remove and link, and changes nothing.                                                                                                                                                      |
| `--json`    | Prints the result as JSON, for scripts: the skills added, updated, removed and unchanged, the links created and removed, replaced edits, unmanaged entries, conflicts and warnings. Combine it with `--dry-run` to see the plan. |

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

## Exit codes

`status` and `check` use the same exit codes. When several apply, the highest wins: a configuration problem makes the other results unreliable, so fix it first. The [troubleshooting guide](troubleshooting.md#exit-codes) explains each one.

| Code | Meaning                                                                                                                             | What to do                                                                             |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 0    | Clean                                                                                                                               | Nothing                                                                                |
| 1    | A synced skill was edited locally                                                                                                   | Run `oak-skills promote`, or revert the edit                                           |
| 2    | Out of date: the skills were synced from a different version from the one installed, or `oakSkills` has changed since the last sync | Run `oak-skills sync`                                                                  |
| 3    | Both: edited locally, and out of date                                                                                               | Promote or revert, then sync                                                           |
| 4    | Something in `.agents/skills/` or `.claude/skills/` that `oak-skills` didn't write                                                  | Move a skill into the central repository with `oak-skills promote --new`, or remove it |
| 5    | A configuration problem, such as an unknown profile, skill or bundle in `oakSkills`                                                 | Fix `package.json`                                                                     |
| 6    | `check` only: the `AGENTS.md` files on one path together pass 32 KiB                                                                | Shorten them, and move how-to guidance into skills                                     |

Every command also uses these:

| Code | Meaning                                                                                        |
| ---- | ---------------------------------------------------------------------------------------------- |
| 64   | The command line itself was wrong, such as an unknown option                                   |
| 70   | A bug in `oak-skills`. Please report it in a `skill-feedback` issue in the central repository. |
