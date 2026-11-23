---
'@oaknational/oak-agent-skills': patch
---

`oak-skills promote` now applies edits whose diff ends on a blank line, and edits that add a binary file, such as an image. Before, both stopped with a "corrupt patch" error.
