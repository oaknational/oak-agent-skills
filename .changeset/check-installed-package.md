---
'@oaknational/oak-agent-skills': patch
---

`oak-skills check` and `status` now compare each synced skill with the installed package's own copy, not only with the checksums recorded in `.agents/skills/.oak-manifest.json`. Changing a skill and its checksum together is now reported as an edit, with exit code 1, and so is a manifest whose checksums, sources or links differ from what `sync` writes. A link added inside a synced skill is reported too, and `sync` replaces the skill to remove it.
