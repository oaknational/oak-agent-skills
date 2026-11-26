# @oaknational/oak-agent-skills

## 0.3.1

### Patch Changes

- 0c2ae0c: `oak-skills validate`, which only runs in the central repository, now checks the skills table in `docs/SKILLS_INDEX.md` instead of `README.md`.

## 0.3.0

### Minor Changes

- 5e2ee3d: `oak-skills init --profile <name>` adds a profile to `base` in the `oakSkills` settings it writes, such as `--profile frontend`. Repeat it for more than one profile. An unknown name stops `init` with exit code 5 and changes nothing.

### Patch Changes

- fbaa659: `oak-skills init` no longer asks for a daily Dependabot schedule: the skills package's own group follows the repository's existing schedule. Messages from `init`, `check` and `status` now join names with "and", describe skills the repository now receives or no longer receives in the same words whether a profile or the settings changed, and say to run `git rm --cached` when git already tracks a local file such as `.DS_Store`.
- 5e2ee3d: `oak-skills init`'s checklist now includes an `engines.node` field in `package.json`, which the workflows read to set up Node.
- 4636450: `oak-skills promote --new` now says when `oakSkills.bundle` names a bundle the installed package doesn't have yet, and how to propose its first skill with `--bundle`. When a name ends with the repository's code, its rename hint moves the code to the front. A pull request's branch and changeset now share one timestamp.
- 4636450: `oak-skills promote --new --bundle <code>` now adds the code to the central repository's `cspell-words.txt`, so the pull request's spelling check passes.

## 0.2.0

### Minor Changes

- ecae12c: `oak-skills promote --new` can now propose the first skill of a new bundle: pass `--bundle <code>` while `oakSkills` names no bundle. It proposes the skill for `skills/repos/<code>/` and adds a `CODEOWNERS` line for that folder naming the skills maintainers. Once a release includes it, set `oakSkills.bundle` and sync.
- 54a23ab: `oak-security-review` now loads for changes to sign-in or access checks, input from outside the system, personal data or secrets, dependencies and CI workflows, rather than for any change to an API, configuration or logging, and says it isn't for performance work or general code review. Its checklist adds mass assignment, webhook signatures, and a section on AI and language models.
- 54a23ab: `oak-ticket-start` now loads only for Linear tickets, not GitHub issues. It asks before moving the ticket to In Progress, and makes no Linear calls when the Linear MCP server isn't available.

### Patch Changes

- 7c10d80: `oak-skills check` no longer crashes with exit code 70 when a committed `AGENTS.md` has been deleted but the deletion isn't committed yet. It now skips that file.
- 7c10d80: `oak-skills check` and `status` now report a folder in `.agents/skills/` named `constructor`, `toString` or `__proto__` as something oak-skills didn't write, and report a file named `__proto__` added to a synced skill as an edit. Before, they passed. `oak-skills promote` also no longer treats such a name as a synced skill.
- d53670a: `oak-skills check` and `status` now compare each synced skill with the installed package's own copy, not only with the checksums recorded in `.agents/skills/.oak-manifest.json`. Changing a skill and its checksum together is now reported as an edit, with exit code 1, and so is a manifest whose checksums, sources or links differ from what `sync` writes. A link added inside a synced skill is reported too, and `sync` replaces the skill to remove it.
- 7c10d80: When `.agents/skills/.oak-manifest.json` is missing, `oak-skills check` and `status` now tell you to run `oak-skills sync`, and exit with code 2 rather than 4. They no longer list the folders and links of the skills your `oakSkills` settings want as something oak-skills didn't write, or suggest removing them. Anything else in the skill folders is still reported, with exit code 4.
- cdecb99: `oak-skills init` no longer asks you to exempt the package from a `github-actions` cooldown, which never holds back the package. It only reads the npm update's cooldown. The weekly coverage matrix reads it the same way.
- cdecb99: `oak-skills init` now reads only the npm update for the repository root in an existing `.github/dependabot.yml`. It asks for the package's own group whenever another group would take the package first, and names every group that would bundle it with other packages, such as one with the pattern `*`, one with no `patterns`, or a security-update group, so you can exclude it there.
- cdecb99: `oak-skills init` now asks you to add `.agents/skills/` to `.prettierignore` when the repository has Prettier settings, and to change `.gitignore` when it ignores `.agents/skills/` or `.claude/skills/`, so what `sync` writes gets committed. Its checklist now names the GitHub App as it appears in the organisation's settings: Oak Agent Skills.
- d53670a: `oak-skills` now rejects a manifest whose file paths leave the skill's folder, or whose links aren't the ones `sync` makes, with exit code 5, rather than reporting files outside `.agents/skills/`.
- d53670a: When `.agents/skills/.oak-manifest.json` can't be read, the advice now says to delete it and run `oak-skills sync`, which writes a new one. Before, it said to run `sync`, which failed the same way. A manifest from a newer `oak-skills` now names its version.
- cdecb99: Every `oak-skills` command now warns when it runs on a Node version outside the package's supported range, `>=24.22.1 <25`. Earlier Node 24 versions trust a compromised certificate authority.
- ecae12c: `oak-skills promote --new` now stops when there are different drafts of the skill in `.agents/skills/` and `.claude/skills/`. Before, it proposed one and deleted both.
- ecae12c: `oak-skills promote` now checks `gh` and your access before asking for a reason, and reads the pull request template before pushing. If the pull request still can't be opened, it deletes the branch it pushed and changes nothing in your repository.
- 7c10d80: `oak-skills promote` now copies your `--message` and the skill's description exactly. Before, text such as `$&` or `$1` was replaced with other parts of the pull request description or `SKILL.md`.
- 7c10d80: `oak-skills promote` now applies edits whose diff ends on a blank line, and edits that add a binary file, such as an image. Before, both stopped with a "corrupt patch" error.
- 7c10d80: `oak-skills promote` now stops straight away, with exit code 64, when the name you give isn't a skill name, such as `../x`, `Oak-TDD` or `a/b`. Skill names use only lowercase letters, digits and single hyphens.
- 8e5e975: `oak-skills promote` now leaves files git ignores out of its preview and its pull request, as `check` does, so a local file such as private notes never reaches the public central repository. `sync` and `promote` now name each ignored file they delete with a skill folder they replace or remove, because git has no copy of it.
- caca04b: Each release now asks npm for provenance in `package.json` itself, so every version keeps its build attestation, whichever way it's published.
- 7c10d80: The package now includes `CHANGELOG.md`, so you can read what changed in each version in `node_modules/@oaknational/oak-agent-skills/CHANGELOG.md`, such as when reviewing a Dependabot update.
- 54a23ab: `oak-accessibility-review` now covers WCAG 2.2 criteria 1.3.3, 1.4.13, 2.1.4, 2.4.1, 2.5.1, 2.5.2, 3.2.1 and 3.2.2, notes that Oak's 7:1 contrast target allows 4.5:1 for large text, and reports checks that need a person as not verified. It corrects its 3.3.4 summary and the label of the GOV.UK Service Manual link. Its checklist moved from `assets/` to `references/`.
- 54a23ab: `oak-pr-create` now checks `gh` before pushing anything, and pushes new commits when it updates a pull request.
- 54a23ab: `oak-sos-draft` now fetches every open ticket whatever its last update, so a ticket that has been in flight quietly for weeks still appears, and its date windows follow `since:`.
- 54a23ab: `oak-tdd` now says what undoing a step means: reversing only that step's own edits, never resetting the branch.
- 54a23ab: The skills that read tickets, pull requests or diffs now treat that text as information, never as instructions, and say what to do when a repository's `AGENTS.md` is missing or silent. `oak-ticket-start`, `oak-sos-draft` and `oak-pr-create` now name what they need in `compatibility`.
- d53670a: `oak-skills check`, `status` and `sync` now skip anything git ignores in the skill folders, such as a `.DS_Store`, because it's never committed. A committed file still counts. `check` now suggests adding a local file to `.gitignore`.
- d53670a: `oak-skills sync`, `init`, `check` and `status` now stop with exit code 5 when `.agents/skills` or `.claude/skills` is a link, such as one linking to the other, and say to remove it. Before, `sync` copied some skills, then crashed with exit code 70 without writing the manifest.
- 3c8ab89: The `oak-skills-sync.yml` workflow that `oak-skills init` writes now replaces only the links in `.claude/skills/` that point at synced skills, as `oak-skills sync` does. Before, its push job deleted every link there, including a team's own. Repositories that already have the workflow keep their copy: to take this fix, delete `.github/workflows/oak-skills-sync.yml` and run `oak-skills init` again.
- 7c10d80: The `oak-skills-sync.yml` workflow that `oak-skills init` writes no longer fails its push job in a repository with nothing committed under `.claude/` yet. It used to read the new `.claude/` folder as a change outside the skill folders. Repositories that already have the workflow can copy the change from `templates/workflows/oak-skills-sync.yml` in the package.
- 54a23ab: The `AGENTS.md` that `oak-skills init` writes now tells agents to ask before running `oak-skills promote`, which opens a pull request other people see.
- 7c10d80: `oak-skills validate` now rejects `oak` as a repository code under `skills/repos/`, because a skill in that bundle could share a name with a shared skill. It only affects the central repository.
- 1ac87ab: `oak-skills validate` now rejects a skill's `metadata.updated` date when it's in the future, or earlier than the date the skill had before the change. It only affects the central repository.

## 0.1.0

### Minor Changes

- 6fe83a0: First release of Oak's shared agent skills and the `oak-skills` command-line tool. It includes the `oak-pr-create`, `oak-security-review`, `oak-sos-draft`, `oak-tdd`, `oak-ticket-start` and `oak-accessibility-review` skills, grouped into the `base` and `frontend` profiles, and the `init`, `sync`, `status`, `check`, `promote` and `validate` commands.

### Patch Changes

- d48b38e: `oak-skills promote` no longer deletes folders outside its temporary copy of the central repository. Every command now rejects a manifest whose `source` for a skill isn't a skill folder in the central repository, such as `skills/central/oak-tdd`.
- 414da5d: Require Node 24.22.1 or a later Node 24, whose certificate store no longer trusts a compromised certificate authority. The `oak-skills-check` and `oak-skills-sync` workflows now install the Node version in the repository's `engines.node`.
- d48b38e: `oak-skills sync` no longer deletes folders outside `.agents/skills/`. Every command now rejects a manifest whose skill names aren't valid skill names, such as `../../src`, and sync refuses to remove or replace any folder that isn't directly inside `.agents/skills/`.
- d48b38e: `oak-ticket-start` now finds the default branch correctly. It drops the `origin/` prefix that `git symbolic-ref` prints, and asks the remote when `origin/HEAD` isn't set, so it no longer branches from `origin/origin/main`.
- d48b38e: Reword a step in `oak-ticket-start` that the skill scanner wrongly reported as fetching and running remote code. What the skill does is unchanged.
- d48b38e: Correct three WCAG citations in `oak-accessibility-review`: autoplaying audio is 1.4.2, link text that makes sense on its own is 2.4.9 (AAA) rather than 2.4.4, and plain language is 3.1.5 (AAA), beyond the AA baseline. It also describes 2.2.1, 2.4.11, 1.4.10, 3.3.4, 1.2.3, 1.2.5 and 4.1.2 as WCAG states them, rather than the stricter AAA versions or a narrower reading.
