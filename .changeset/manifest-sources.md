---
'@oaknational/oak-agent-skills': patch
---

`oak-skills promote` no longer deletes folders outside its temporary copy of the central repository. Every command now rejects a manifest whose skill sources aren't skill folders under `skills/`.
