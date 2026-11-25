---
'@oaknational/oak-agent-skills': patch
---

`oak-skills validate` now rejects a skill's `metadata.updated` date when it's in the future, or earlier than the date the skill had before the change. It only affects the central repository.
