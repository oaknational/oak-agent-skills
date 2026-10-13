# Code review checklist

Use these questions to guide a review. Not every question applies to every change: skip the ones that don't, and spend the most time on correctness and risk.

## Correctness

- Does the code handle every input it can receive, including empty, missing, very large and unexpected values?
- Are `null` and `undefined` handled where they can occur, without hiding them behind non-null assertions or loose type casts?
- Are boundaries right: off-by-one errors, inclusive and exclusive ranges, time zones and date arithmetic?
- Is every promise awaited or deliberately handled? Can an async error go unnoticed?
- Are errors handled at the right level: caught where something useful can be done, and otherwise allowed to reach a caller that reports them?
- Can two things happen at once? Look for race conditions, shared state and work that isn't idempotent when it's retried.
- Are resources released: connections, file handles, timers, subscriptions and event listeners?
- Does a `switch` or chain of conditions cover every case, ideally checked by the type system?
- Do changes to shared types, schemas or API contracts match everywhere they're used?

## Risk

- **Security:** does the change touch authentication, authorisation, user input, secrets, personal data, dependencies or CI workflows? If so, review it with the `oak-security-review` skill as well.
- **Data:** can the change lose, corrupt or expose data? Are database migrations reversible, and safe to run while the old code is still serving traffic?
- **Compatibility:** does it change a public API, an event, a URL, a stored format or a configuration option that something else relies on? Is the change backwards compatible, or are the callers updated at the same time?
- **Performance:** does it add work inside a loop, a query per item, an unbounded list, or a large download or bundle? Does it run on a hot path?
- **Failure:** what happens when a network call, dependency or third-party service fails or is slow? Are there timeouts and sensible fallbacks?
- **Rollout:** can the change be rolled back safely? If it's behind a feature flag, is the flag's default safe?
- **Configuration:** are new environment variables or settings documented, and do they have safe defaults?

## Tests

- Is the new or changed behaviour covered by tests at the right level: unit, integration or end to end?
- Are the error paths and edge cases tested, not just the happy path?
- Would each test fail if the code it covers were wrong? A test that can't fail is worse than none.
- Do the tests check behaviour rather than implementation details, so a safe refactor wouldn't break them?
- Are the tests deterministic? Look for reliance on the current time, random values, ordering or the network.
- Are mocks limited to what the test needs, and do they behave like the real thing?
- For a bug fix, is there a test that reproduces the bug?

## Design

- Does the change follow the architecture and conventions described in `AGENTS.md`?
- Does each function, module and component have one clear responsibility?
- Is new code in the right place, or does it reach across boundaries the architecture keeps separate?
- Does it duplicate something that already exists in the codebase?
- Is any new abstraction paying for itself now, rather than for an imagined future?
- Are new dependencies justified, and is there an existing one that would do the job?
- Is the public surface, such as exports, props and endpoints, as small as it can be?

## Readability

- Do names say what things are and do? Are they accurate after this change?
- Is the code as simple as the problem allows?
- Do comments explain why something is done, not what the code does? Are any comments now out of date?
- Would someone new to this part of the codebase understand the change?

## Documentation and housekeeping

- Is `AGENTS.md`, a README or other documentation updated if the change affects commands, paths, architecture or behaviour people rely on?
- If the repository uses changesets or a changelog, does the change include one where it's needed?
- Are there leftover debugging statements, commented-out code, or to-do notes without a linked issue?
