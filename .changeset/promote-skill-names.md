---
'@oaknational/oak-agent-skills': patch
---

`oak-skills promote` now stops straight away, with exit code 64, when the name you give isn't a skill name, such as `../x`, `Oak-TDD` or `a/b`. Skill names use only lowercase letters, digits and single hyphens.
