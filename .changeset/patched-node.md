---
'@oaknational/oak-agent-skills': patch
---

Require Node 24.22.1 or a later Node 24, whose certificate store no longer trusts a compromised certificate authority. The `oak-skills-check` and `oak-skills-sync` workflows now install the Node version in the repository's `engines.node`.
