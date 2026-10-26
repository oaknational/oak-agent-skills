---
name: oak-pr-create
description: Writes a pull request title and description that explain why a change was made, its risk, the evidence that it works and how to roll it back. Use when opening or updating a pull request, or when asked to write or improve a PR title, description or testing instructions.
license: MIT
metadata:
  owner: '@oaknational/todo-engineers-team'
  updated: '2026-10-26'
---

# Pull request authoring

Write a pull request that a reviewer can understand, test and approve without asking the author anything. The title says what the change does; the description says why, what could go wrong, how we know it works, and how to undo it.

## Before you write

1. Read the repository's `AGENTS.md` for its conventions, such as ticket references or required sections.
2. Look for a pull request template, usually `.github/pull_request_template.md`. If there is one, fill it in: its structure takes precedence over the structure below, but cover the same ground.
3. Read the whole change against the branch it will merge into, for example with `git diff main...HEAD`, and read the commit messages.
4. Find the reason for the change: the linked issue, the conversation that led to it, or the author's explanation. If you can't tell why the change was made, ask rather than invent a reason.

## The title

Use a [Conventional Commit](https://www.conventionalcommits.org/) title, because many of our repositories squash-merge pull requests and the title becomes the commit on `main`.

```text
type(scope): summary
```

- **type:** `feat` for new behaviour, `fix` for a bug fix, `docs`, `test`, `refactor`, `perf`, `build`, `ci` or `chore` for everything else.
- **scope:** optional, the area changed, such as a package, feature or skill name.
- **summary:** what the change does, in the imperative and lower case, without a full stop. For example, "add lesson search filters", not "Added lesson search filters."
- Add `!` after the type or scope for a breaking change, such as `feat(api)!: remove the v1 lessons endpoint`.
- Keep it under about 72 characters.

If the repository references tickets in titles, follow the convention in `AGENTS.md`.

## The description

Cover these four things, in this order. [Writing the description](references/pr-description.md) explains each one, with an example.

1. **What and why.** What changes, in a few sentences, and the problem it solves. Link the issue.
2. **Risk.** What could break, who would notice, and what you did to reduce the risk. Say so plainly if the risk is low, and why.
3. **Test evidence.** What you checked and how: automated tests added or run, and manual checks with their results. Then give the reviewer [testing instructions](references/testing-instructions.md) they can follow.
4. **Rollback.** How to undo the change if it goes wrong: usually reverting the pull request, but say if a migration, data change, feature flag or release step makes it more involved.

Keep it as short as the change allows. A one-line fix needs a few sentences, not every heading.

## Rules

- Only claim what's true. Don't say tests pass unless they ran and passed, and don't describe checks nobody did. If something wasn't tested, say so.
- Never include secrets, credentials, personal data or internal links that shouldn't be public. Many of our repositories are public.
- Give every screenshot or image alt text that says what it shows, and describe visual changes in words too.
- Write in plain British English for someone who hasn't seen the work. Define anything a reviewer outside the team might not know.
- Don't paste the diff into the description. Point to the important parts instead.

## Updating a pull request

When the change grows or its approach changes after review, update the title and description so they still describe what will merge. Reviewers and future readers rely on them, not on the comment history.
