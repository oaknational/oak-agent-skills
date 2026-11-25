---
'@oaknational/oak-agent-skills': patch
---

When `.agents/skills/.oak-manifest.json` can't be read, the advice now says to delete it and run `oak-skills sync`, which writes a new one. Before, it said to run `sync`, which failed the same way. A manifest from a newer `oak-skills` now names its version.
