# Skills index

Every skill in the package, the profile or bundle that includes it, and what it does. A repository receives the skills in the profiles and the bundle its `oakSkills` settings name, as [Choosing your skills](cli.md#choosing-your-skills) explains.

`pnpm readme:skills` generates the table from the skills and `skills/profiles.json`, and `pnpm validate` fails if it's out of date, so don't edit it by hand.

<!-- prettier-ignore-start -->
<!-- skills-table:start -->
| Skill | Profile or bundle | What it does |
| --- | --- | --- |
| [`oak-accessibility-review`](../skills/central/oak-accessibility-review/SKILL.md) | `frontend` | Builds and reviews interface code to meet WCAG 2.2 AA, with Oak's 7:1 contrast target, including the criteria automated checkers miss. Use when building or reviewing components, pages, forms, quizzes or embedded media, or when asked whether something is accessible, to audit accessibility, or to check keyboard support, focus, contrast, alt text, labels, captions or target size. |
| [`oak-pr-create`](../skills/central/oak-pr-create/SKILL.md) | `base` | Writes a pull request title and description that explain what a change does and why, with steps to test it, then opens or updates the pull request once the user approves them. Use when opening, creating or updating a pull request, or when asked to write or improve a PR title, description or testing instructions. |
| [`oak-security-review`](../skills/central/oak-security-review/SKILL.md) | `base` | Threat-models a code change for security, covering authorisation, input handling, secrets and dependencies, and keeping personal data and secrets out of code, logs and errors. Use when a change adds or alters sign-in, permissions or other access checks, handles input from outside the system, stores, logs or exposes personal data or secrets, adds a dependency or changes a CI workflow, or when asked for a security review. Not for performance work or general code review. |
| [`oak-sos-draft`](../skills/central/oak-sos-draft/SKILL.md) | `base` | Drafts a squad's Scrum of Scrums update from its Linear activity, checked against the previous meeting's notes, covering accomplishments, upcoming goals, cross-team dependencies and risks. Use when asked to write, prepare or draft a Scrum of Scrums report, update or notes. |
| [`oak-tdd`](../skills/central/oak-tdd/SKILL.md) | `base` | Builds a change test first, writing a failing test for each small piece of behaviour, making it pass with the simplest code, then tidying up, and adds tests to existing code before changing it. Use when asked to use TDD or write tests first, to add or improve tests, or to fix a bug with a test that proves the fix. |
| [`oak-ticket-start`](../skills/central/oak-ticket-start/SKILL.md) | `base` | Starts work on a Linear ticket by listing the tickets ready to start, summarising the chosen one with its acceptance criteria, creating a local branch from the latest default branch, moving the ticket to In Progress, then offering to plan the work. Use when asked to start, pick up or begin a Linear ticket, or to create a branch for one. |
<!-- skills-table:end -->
<!-- prettier-ignore-end -->
