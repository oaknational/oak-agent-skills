---
'@oaknational/oak-agent-skills': patch
---

`oak-skills init` no longer asks for a daily Dependabot schedule: the skills package's own group follows the repository's existing schedule. Messages from `init`, `check` and `status` now join names with "and", describe skills the repository now receives or no longer receives in the same words whether a profile or the settings changed, and say to run `git rm --cached` when git already tracks a local file such as `.DS_Store`.
