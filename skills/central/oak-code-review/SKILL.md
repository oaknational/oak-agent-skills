---
name: oak-code-review
description: Reviews a code change for correctness, design, risk and test coverage, and reports findings ranked by how much they matter. Use when asked to review a pull request, a branch, a diff or staged changes, or to check work before it's merged.
license: MIT
metadata:
  owner: '@oaknational/todo-engineers-team'
  updated: '2026-10-13'
---

# Code review

Review a change the way a careful senior engineer on the team would: find the problems that matter before they reach `main`, explain each one so the author can act on it, and stay quiet about things that don't matter.

## Before you start

1. Read the repository's `AGENTS.md`. It lists the commands to build, test, lint and type-check, the architecture, and the rules this repository holds itself to. Use those commands rather than guessing.
2. Get the whole change, not just the part you were shown:
   - for a pull request or branch, compare it with the branch it will merge into, using a three-dot diff such as `git diff main...HEAD`;
   - for work in progress, include both staged and unstaged changes.
3. Find out what the change is for: the pull request description, the linked issue and the commit messages. If the intent is unclear, say what you assumed.
4. If the change is very large, say so, suggest how it could be split, and review it in parts.

## How to review

Work through the change in this order. Earlier areas matter more, so don't let a long list of small points bury a serious one.

1. **Correctness.** Does the code do what it's meant to, for every input it can receive? Look for unhandled cases, wrong conditions, errors that are swallowed, and async code that isn't awaited.
2. **Risk.** What could this break? Think about security, data loss, performance, compatibility with existing callers and data, and how it behaves when a dependency fails. If the change touches authentication, user input, secrets, personal data or dependencies, also follow the `oak-security-review` skill if it's available.
3. **Tests.** Is the new behaviour tested, including its error paths? Would the tests fail if the code were wrong?
4. **Design.** Does the change fit the architecture in `AGENTS.md`? Is each piece of code in the right place, with a clear responsibility? Is there a simpler way to do the same thing?
5. **Readability.** Will the next person understand it? Are names accurate, and do comments explain why rather than what?

[The checklist](references/checklist.md) has the detailed questions for each area.

### Read beyond the diff

The diff shows what changed, not what it affects. Open the files around each change, find the callers of changed functions, and check that types, schemas, tests and documentation that depend on the change were updated with it.

### Check before you claim

Don't report a bug you haven't traced. Before saying something is wrong:

- follow the code path that triggers it, and name the input or state that causes it;
- check the problem isn't already handled elsewhere, such as by a caller, a type or a schema;
- where you can, run the relevant tests or type check from `AGENTS.md`, and say what you ran.

If you can't confirm something, say it's a question or a risk, not a defect.

## What not to report

- Anything the repository's linter, formatter or type checker enforces. Tools already catch it.
- Personal preferences that the repository's rules don't cover.
- Problems in code the change didn't touch, unless the change makes them worse. Mention them separately, briefly, if they're serious.

## Reporting findings

Lead with a one- or two-sentence summary: whether the change is ready to merge, and the most important reason if not.

Then list findings, most important first, using these levels:

| Level      | Meaning                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| Must fix   | A bug, security problem, data risk or missing test that should block merging |
| Should fix | A real problem that can be fixed in this change or a quick follow-up         |
| Consider   | An improvement worth weighing, with the trade-off explained                  |
| Question   | Something you need the author to explain before you can judge it             |

For each finding, give:

- where it is, as `path/to/file.ts:42`;
- what's wrong, in one sentence;
- why it matters: the concrete input, state or sequence that leads to the problem;
- a suggested fix, with a short code example if it helps.

[Writing findings](references/writing-findings.md) has examples of good and weak findings.

If you found nothing worth reporting, say so plainly, and say what you checked.

## Tone

Review the code, not the person. Be direct and specific, explain your reasoning, and don't pad findings with praise or apologies. If something is done well and worth copying elsewhere, a short note is welcome.
