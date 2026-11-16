# @oaknational/oak-agent-skills

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
