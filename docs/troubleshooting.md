# Troubleshooting oak-skills

This guide covers the problems a consuming repository is most likely to meet, starting with what each exit code from `oak-skills status` and `oak-skills check` means and how to fix it.

When several problems apply at once, the highest exit code wins, so fix that one first and run the command again.

## Exit codes

### Exit code 1: a synced skill was edited

A file in `.agents/skills/` changed since the last sync, a file was added to or deleted from a synced skill, or a link in `.claude/skills/` was deleted or changed. Synced skills are read-only in consuming repositories, because the next sync would overwrite any change.

An edit often means the central skill is wrong or incomplete, so don't just throw it away:

- **If the edit improves the skill**, send it to the central repository with `pnpm exec oak-skills promote <skill>`. It opens a pull request there and restores the synced copy here, so your pull request passes. The improvement arrives with the next release.
- **If the edit was accidental**, revert it with git, or run `pnpm exec oak-skills sync` to restore the synced copy.

### Exit code 2: the skills are out of date

The committed skills don't match what `oak-skills sync` would write now. This happens when:

- the installed version of `@oaknational/oak-agent-skills` differs from the version the skills were synced from, in either direction, such as after a dependency update or pinning an older version;
- the `oakSkills` settings in `package.json` changed, adding or removing skills;
- the repository has never been synced.

Run `pnpm exec oak-skills sync` and commit the result. On a Dependabot pull request, the sync workflow does this for you; if it didn't, see [the sync workflow didn't run](#the-sync-workflow-didnt-run).

### Exit code 3: edited and out of date

Both of the above. Deal with the edit first, by promoting or reverting it, as described for [exit code 1](#exit-code-1-a-synced-skill-was-edited). Then sync.

Promote before you sync: `oak-skills promote` compares your edit with the version it was synced from, and stops if the versions differ, because the comparison would be wrong. If you've already updated the package, check out the previous lockfile, promote, then update again.

### Exit code 4: something oak-skills didn't write

There's a folder or file in `.agents/skills/` or `.claude/skills/` that `oak-skills sync` didn't write, such as a skill drafted in this repository, or a skill left over from before the repository used `oak-skills`. Every skill lives in the central repository, so that it gets the same checks and reaches every repository that needs it.

- **To keep a skill**, propose it for your repository's bundle with `pnpm exec oak-skills promote --new <name>`. It removes the local draft, and the skill arrives with the next release.
- **Otherwise**, delete it.

Personal skills you don't want to share belong in `~/.claude/skills/` or `~/.agents/skills/` on your own machine, not in the repository. Don't give them the `oak-` prefix: in Claude Code, a personal skill overrides a project skill with the same name.

### Exit code 5: a configuration problem

`oak-skills` can't work out which skills the repository should have. The message says which of these it is:

- **An unknown profile, bundle or skill name** in `oakSkills` in the root `package.json`, often a typo. The message lists the names that exist in the installed version.
- **No `oakSkills` settings.** Run `pnpm exec oak-skills init` to add them.
- **A setting `oak-skills` doesn't recognise**, or a value of the wrong type.
- **No root `package.json`**, or the command isn't running inside a git repository.
- **An unreadable `.agents/skills/.oak-manifest.json`.** Restore it from git, or run `pnpm exec oak-skills sync` to write it again.

Fix the settings, then run the command again.

### Exit code 6: AGENTS.md is too large

Only `oak-skills check` reports this. The `AGENTS.md` files on one path, from the repository root down to a folder, together pass 32 KiB. Codex counts all of them against one budget and silently cuts off anything beyond it, so instructions at the end would be lost.

Keep each `AGENTS.md` to about 100 lines of orientation: what the repository is, its commands, its architecture and its rules. Move guidance on how to do a kind of task into a skill. `check` also warns, without failing, when a single `AGENTS.md` passes 100 lines.

### Other exit codes

| Code | Meaning                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 64   | The command line was wrong, such as an unknown command or option. The message says what was wrong; run the command with `--help` for its options. |
| 70   | A bug in `oak-skills`. Please report it in a `skill-feedback` issue in the central repository, with the command you ran and its output.           |

## Other problems

### The sync workflow didn't run

The `oak-skills-sync.yml` workflow only runs on a pull request that Dependabot opened in this repository and that bumps `@oaknational/oak-agent-skills`. If a bump pull request has no sync commit:

- Check the workflow file exists on the default branch. `oak-skills init` writes it.
- Check the pull request changes `package.json` or `pnpm-lock.yaml`, which trigger the workflow.
- Check the GitHub App is installed on the repository, and that the `OAK_SKILLS_APP_CLIENT_ID` and `OAK_SKILLS_APP_KEY` secrets are visible to Dependabot.

To sync by hand instead, check out the pull request's branch, run `pnpm install` and `pnpm exec oak-skills sync`, then commit the result with `[dependabot skip]` in the message, so Dependabot can still rebase it.

### Required checks didn't run again after the sync

The sync workflow pushes its commit with a token from Oak's GitHub App, so GitHub runs the pull request's checks again on the new commit. A commit pushed with a workflow's own `GITHUB_TOKEN` wouldn't start them, and the pull request would wait for checks that never report.

- The sync workflow's own run for the App's push shows as skipped. That's expected: there's nothing left to sync.
- Check the sync commit's author is the App's bot account. If it's `github-actions[bot]`, the workflow file has been changed to push with `GITHUB_TOKEN`. Compare it with the template in the installed package, `node_modules/@oaknational/oak-agent-skills/templates/workflows/oak-skills-sync.yml`.
- To start the checks by hand, close the pull request and reopen it.

### Dependabot stopped rebasing a pull request

Dependabot stops rebasing a pull request that hasn't merged within 30 days, so merge skills updates promptly. It also stops if someone pushes a commit to it without `[dependabot skip]` in the message. The sync workflow's commit includes it.

To bring a stale pull request up to date, comment `@dependabot recreate` on it. Dependabot rebuilds it from scratch, overwriting any edits, and the sync workflow runs again.

### Staying on an older version

If a release causes a problem in your repository, you can stay on the previous version while it's fixed centrally:

1. Install the version you want at the repository root: `pnpm add -D --save-exact @oaknational/oak-agent-skills@<version>`. In a pnpm workspace that lists packages, add `-w`, as [Subscribing a repository](cli.md#subscribing-a-repository) explains.
2. Run `pnpm exec oak-skills sync`, then commit `package.json`, the lockfile and the skill folders together.
3. On the next skills update pull request, comment `@dependabot ignore @oaknational/oak-agent-skills minor version`, using `major` or `patch` instead to match the release you're skipping. Dependabot closes the pull request and doesn't offer that version again.

You'll miss every fix in the meantime, so raise a `skill-feedback` issue saying what went wrong. When it's fixed, comment `@dependabot unignore @oaknational/oak-agent-skills` on a Dependabot pull request to receive updates again; `@dependabot show @oaknational/oak-agent-skills ignore conditions` lists what's ignored.

### oak-skills promote stopped

`promote` checks everything it needs before it changes anything, and says what to fix:

| Message                                                   | What to do                                                                                                                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| gh is not installed, or not signed in                     | Install the [GitHub CLI](https://cli.github.com/), then run `gh auth login`.                                                                                                        |
| You don't have write access                               | Ask the skills maintainers for access, or raise a `skill-feedback` issue describing the change.                                                                                     |
| The skills are out of date                                | The installed version changed after the last sync, so `promote` can't tell your edit apart from the update. Check out the previous lockfile, reinstall, promote, then update again. |
| Something oak-skills didn't write is in the skill folders | Promote that draft first with `--new`, or remove it.                                                                                                                                |
| The skill hasn't been edited                              | There's nothing to promote: the copy matches the synced one.                                                                                                                        |
| No release tag                                            | The central repository has no `v<version>` tag for your installed version. Tell the skills maintainers.                                                                             |
| The change couldn't be applied                            | The skill was removed or moved on `main` since your version. Raise a `skill-feedback` issue describing the change instead.                                                          |
| The title would be too long                               | Give a shorter reason with `--message`.                                                                                                                                             |

If the merge conflicted, `promote` still opens the pull request, as a draft with the conflict marked, and restores your copy. Resolve the conflict in the pull request.

### Skills are listed twice in Cursor or Copilot

This is expected. Cursor and GitHub Copilot read both `.agents/skills/` and `.claude/skills/`, and the links in `.claude/skills/` point at the same files, so each skill appears twice. Both entries are the same skill. Claude Code reads only `.claude/skills/` and Codex only `.agents/skills/`, so both folders are needed.

### Skill links were checked out as text files

The entries in `.claude/skills/` are symbolic links. If your git client or file system doesn't support them, each appears as a small text file holding a path, and Claude Code can't load the skill. Check that git's `core.symlinks` setting is `true`, and clone the repository again. We don't support Windows without symbolic link support.
