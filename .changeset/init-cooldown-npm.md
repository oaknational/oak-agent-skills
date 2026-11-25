---
'@oaknational/oak-agent-skills': patch
---

`oak-skills init` no longer asks you to exempt the package from a `github-actions` cooldown, which never holds back the package. It only reads the npm update's cooldown. The weekly coverage matrix reads it the same way.
