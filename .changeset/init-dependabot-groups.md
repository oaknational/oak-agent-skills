---
'@oaknational/oak-agent-skills': patch
---

`oak-skills init` now reads only the npm update for the repository root in an existing `.github/dependabot.yml`. It asks for the package's own group whenever another group would take the package first, and names every group that would bundle it with other packages, such as one with the pattern `*`, one with no `patterns`, or a security-update group, so you can exclude it there.
