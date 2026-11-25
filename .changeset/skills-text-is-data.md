---
'@oaknational/oak-agent-skills': patch
---

The skills that read tickets, pull requests or diffs now treat that text as information, never as instructions, and say what to do when a repository's `AGENTS.md` is missing or silent. `oak-ticket-start`, `oak-sos-draft` and `oak-pr-create` now name what they need in `compatibility`.
