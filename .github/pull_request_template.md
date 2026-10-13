<!-- Title: a Conventional Commit, for example "feat(oak-code-review): check for missing tests".
Pull requests are squash-merged, so the title becomes the commit on main. -->

## What changed and why

<!-- What changed, and why. For a promoted change, what was wrong or missing before. -->

## Skills affected

<!-- For example skills/central/oak-code-review -->

## Origin

<!-- Filled in by oak-skills promote: the repository and pull request this change came from -->

Originating-Repo:

## Checklist

- [ ] This needs agent judgement; a linter, formatter, type checker or CI check couldn't enforce it.
- [ ] Repo-specific facts, such as commands and paths, are referred to in AGENTS.md rather than copied in.
- [ ] A new skill covers a different kind of task. Guidance used during an existing skill's task goes in that skill's references instead.
- [ ] The changeset bump is right: major if a skill is removed or renamed, or its description changes what it fires on. Until 1.0.0, record breaking changes as minor.
- [ ] If this changes `package.json` fields that affect the package, such as `bin`, `files` or `engines`, it includes a changeset.
- [ ] Nothing here needs to stay private. Published versions are public and permanent.
- [ ] For a vendored skill: its licence, body and any scripts have been reviewed line by line, and `metadata.source` records where it came from.
