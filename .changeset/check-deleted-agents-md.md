---
'@oaknational/oak-agent-skills': patch
---

`oak-skills check` no longer crashes with exit code 70 when a committed `AGENTS.md` has been deleted but the deletion isn't committed yet. It now skips that file.
