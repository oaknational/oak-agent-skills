---
'@oaknational/oak-agent-skills': patch
---

`oak-skills check` and `status` now report a folder in `.agents/skills/` named `constructor`, `toString` or `__proto__` as something oak-skills didn't write, and report a file named `__proto__` added to a synced skill as an edit. Before, they passed. `oak-skills promote` also no longer treats such a name as a synced skill.
