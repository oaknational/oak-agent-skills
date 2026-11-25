---
'@oaknational/oak-agent-skills': patch
---

`oak-skills` now rejects a manifest whose file paths leave the skill's folder, or whose links aren't the ones `sync` makes, with exit code 5, rather than reporting files outside `.agents/skills/`.
