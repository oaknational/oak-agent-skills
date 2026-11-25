---
'@oaknational/oak-agent-skills': patch
---

`oak-skills sync`, `init`, `check` and `status` now stop with exit code 5 when `.agents/skills` or `.claude/skills` is a link, such as one linking to the other, and say to remove it. Before, `sync` copied some skills, then crashed with exit code 70 without writing the manifest.
