---
'@oaknational/oak-agent-skills': patch
---

`oak-skills promote` no longer deletes folders outside its temporary copy of the central repository. Every command now rejects a manifest whose `source` for a skill isn't a skill folder in the central repository, such as `skills/central/oak-tdd`.
