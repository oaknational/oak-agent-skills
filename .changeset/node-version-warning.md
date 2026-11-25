---
'@oaknational/oak-agent-skills': patch
---

Every `oak-skills` command now warns when it runs on a Node version outside the package's supported range, `>=24.22.1 <25`. Earlier Node 24 versions trust a compromised certificate authority.
