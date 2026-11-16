---
'@oaknational/oak-agent-skills': patch
---

`oak-ticket-start` now finds the default branch correctly. It drops the `origin/` prefix that `git symbolic-ref` prints, and asks the remote when `origin/HEAD` isn't set, so it no longer branches from `origin/origin/main`.
