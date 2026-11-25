---
'@oaknational/oak-agent-skills': patch
---

`oak-skills promote` now checks `gh` and your access before asking for a reason, and reads the pull request template before pushing. If the pull request still can't be opened, it deletes the branch it pushed and changes nothing in your repository.
