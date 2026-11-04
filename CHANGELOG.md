# @oaknational/oak-agent-skills

## 0.1.0

### Minor Changes

- 6fe83a0: First release of Oak's shared agent skills and the `oak-skills` command-line tool. It includes the `oak-pr-create`, `oak-security-review`, `oak-sos-draft`, `oak-tdd`, `oak-ticket-start` and `oak-accessibility-review` skills, grouped into the `base` and `frontend` profiles, and the `init`, `sync`, `status`, `check`, `promote` and `validate` commands.

### Patch Changes

- 414da5d: Require Node 24.22.1 or a later Node 24, whose certificate store no longer trusts a compromised certificate authority. The `oak-skills-check` and `oak-skills-sync` workflows now install the Node version in the repository's `engines.node`.
