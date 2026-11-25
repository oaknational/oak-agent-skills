---
'@oaknational/oak-agent-skills': patch
---

`oak-skills check`, `status` and `sync` now skip anything git ignores in the skill folders, such as a `.DS_Store`, because it's never committed. A committed file still counts. `check` now suggests adding a local file to `.gitignore`.
