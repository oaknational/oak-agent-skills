---
'@oaknational/oak-agent-skills': patch
---

`oak-skills sync` no longer deletes folders outside `.agents/skills/`. Every command now rejects a manifest whose skill names aren't valid skill names, such as `../../src`, and sync refuses to remove or replace any folder that isn't directly inside `.agents/skills/`.
