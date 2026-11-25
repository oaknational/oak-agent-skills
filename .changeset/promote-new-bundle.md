---
'@oaknational/oak-agent-skills': minor
---

`oak-skills promote --new` can now propose the first skill of a new bundle: pass `--bundle <code>` while `oakSkills` names no bundle. It proposes the skill for `skills/repos/<code>/` and adds a `CODEOWNERS` line for that folder naming the skills maintainers. Once a release includes it, set `oakSkills.bundle` and sync.
