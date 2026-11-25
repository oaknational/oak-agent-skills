---
'@oaknational/oak-agent-skills': patch
---

`oak-skills promote --new` now stops when there are different drafts of the skill in `.agents/skills/` and `.claude/skills/`. Before, it proposed one and deleted both.
