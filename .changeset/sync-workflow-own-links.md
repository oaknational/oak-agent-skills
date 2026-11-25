---
'@oaknational/oak-agent-skills': patch
---

The `oak-skills-sync.yml` workflow that `oak-skills init` writes now replaces only the links in `.claude/skills/` that point at synced skills, as `oak-skills sync` does. Before, its push job deleted every link there, including a team's own. Repositories that already have the workflow keep their copy: to take this fix, delete `.github/workflows/oak-skills-sync.yml` and run `oak-skills init` again.
