---
'@oaknational/oak-agent-skills': patch
---

`oak-skills init` now asks you to add `.agents/skills/` to `.prettierignore` when the repository has Prettier settings, and to change `.gitignore` when it ignores `.agents/skills/` or `.claude/skills/`, so what `sync` writes gets committed. Its checklist now names the GitHub App as it appears in the organisation's settings: Oak Agent Skills.
