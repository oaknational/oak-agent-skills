---
'@oaknational/oak-agent-skills': patch
---

When `.agents/skills/.oak-manifest.json` is missing, `oak-skills check` and `status` now tell you to run `oak-skills sync`, and exit with code 2 rather than 4. They no longer list the folders and links of the skills your `oakSkills` settings want as something oak-skills didn't write, or suggest removing them. Anything else in the skill folders is still reported, with exit code 4.
