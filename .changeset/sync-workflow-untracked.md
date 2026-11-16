---
'@oaknational/oak-agent-skills': patch
---

The `oak-skills-sync.yml` workflow that `oak-skills init` writes no longer fails its push job in a repository with nothing committed under `.claude/` yet. It used to read the new `.claude/` folder as a change outside the skill folders. Repositories that already have the workflow can copy the change from `templates/workflows/oak-skills-sync.yml` in the package.
