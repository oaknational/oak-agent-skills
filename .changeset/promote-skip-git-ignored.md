---
'@oaknational/oak-agent-skills': patch
---

`oak-skills promote` now leaves files git ignores out of its preview and its pull request, as `check` does, so a local file such as private notes never reaches the public central repository. `sync` and `promote` now name each ignored file they delete with a skill folder they replace or remove, because git has no copy of it.
