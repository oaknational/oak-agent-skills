---
'@oaknational/oak-agent-skills': patch
---

`oak-skills validate` now rejects `oak` as a repository code under `skills/repos/`, because a skill in that bundle could share a name with a shared skill. It only affects the central repository.
