---
'@oaknational/oak-agent-skills': patch
---

`oak-skills promote` now copies your `--message` and the skill's description exactly. Before, text such as `$&` or `$1` was replaced with other parts of the pull request description or `SKILL.md`.
