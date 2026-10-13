# Writing the description

The description answers the questions a reviewer would otherwise ask: why this change, what could go wrong, how do we know it works, and how do we undo it?

## What and why

Start with the problem, then the change that solves it.

- Say what was wrong or missing before, and who it affected.
- Summarise what the change does in a few sentences. Mention anything surprising, such as a file moved or a behaviour deliberately left unchanged.
- Explain significant decisions and the alternatives you rejected, briefly.
- Link the issue or ticket.

Weak: "Updates the search component."

Better: "Teachers searching for a lesson by its exact title often saw it on the second page, because results were sorted by date. This sorts exact title matches first. Closes #1234."

## Risk

Name what could break, and why you're confident it won't.

- What does the change touch that other things depend on: shared components, APIs, database tables, configuration, build or deployment?
- Who would notice if it went wrong: teachers, pupils, other teams, other services?
- What did you do to reduce the risk: tests, a feature flag, a staged rollout, a check against production-like data?

Low-risk changes are common. Say so, with the reason: "Low risk: only the new filter is affected, and it's behind the `search-filters` flag, which is off in production."

## Test evidence

Say what was checked, and the result.

- Automated tests added or changed, and what they cover.
- Checks you ran, such as the commands in `AGENTS.md`, and their outcome.
- Manual checks, with what you did and what you saw.
- Anything you couldn't test, and why.

Then give testing instructions a reviewer can follow, as described in [the testing instructions guide](testing-instructions.md).

## Rollback

Say how to undo the change if it causes a problem after merging.

- Usually: "Revert this pull request."
- If there's a database migration, can it be reversed, and does the old code work with the new schema?
- If data is changed or deleted, how would it be restored?
- If the change is behind a feature flag, say which flag to turn off.
- If it's released as a package, say whether a new version would need to be published.

## Example

```markdown
## What and why

Teachers searching for a lesson by its exact title often saw it on the second page, because results were sorted by date. This sorts exact title matches first, then everything else by date as before. Closes #1234.

## Risk

Low. Only the ordering of search results changes, and only when a result's title matches the query exactly. The search API's response shape is unchanged.

## Test evidence

- Added unit tests for the new sort, including ties and case differences.
- Ran the unit and integration tests listed in AGENTS.md: all pass.
- Checked the preview deployment with five real lesson titles: each appears first.

## Testing instructions

1. Open the preview deployment and go to lesson search.
2. Search for "Introduction to fractions".
3. The lesson with that exact title appears first, followed by other results, newest first.

## Rollback

Revert this pull request. No data or schema changes.
```
