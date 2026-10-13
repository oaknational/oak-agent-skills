# Writing findings

A good finding lets the author fix the problem without asking a follow-up question. It says where the problem is, what goes wrong, why it matters, and what to do about it.

## A strong finding

> **Must fix:** `src/lessons/getLesson.ts:58`
>
> `getLesson` returns the cached lesson without checking `lesson.isPublished`, so a lesson that's been unpublished is still served for up to an hour.
>
> This happens when a lesson is unpublished after it's been cached: the cache key is the slug, and nothing clears it on unpublish. Teachers would keep seeing content that was withdrawn, for example because of an error.
>
> Check `isPublished` after reading from the cache, or clear the cache entry in `unpublishLesson`:
>
> ```ts
> const cached = await cache.get(slug);
> if (cached?.isPublished) return cached;
> ```

It works because it:

- points to an exact place;
- names the condition that triggers the problem;
- explains the effect on people, not just the code;
- offers a fix the author can apply or adapt.

## Weak findings, and how to improve them

| Weak                     | Why it's weak                                  | Better                                                                                             |
| ------------------------ | ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| "This might have a bug." | No location, no condition, no effect.          | Name the input or state that causes the bug, and what happens.                                     |
| "Consider adding tests." | Doesn't say what's untested or why it matters. | "There's no test for an empty `units` array, which `buildSequence` treats differently on line 31." |
| "This could be cleaner." | A preference, with no reason to act.           | Explain what's hard to follow, and show the simpler version. Or leave it out.                      |
| "Use `const` here."      | The linter enforces this.                      | Leave it to the linter.                                                                            |
| "Security issue!"        | Alarming without evidence.                     | Describe who can do what, through which input, and the impact.                                     |

## Questions

When you can't tell whether something is a problem, ask instead of asserting:

> **Question:** `src/api/units.ts:112` retries the request three times with no delay. Is the upstream service safe to call again immediately after a failure, or should this back off?

## Summaries

Open the review with a short summary, so the author knows where they stand before reading the details:

> Not ready to merge yet. The caching change can serve unpublished lessons (one must-fix finding below). The rest of the change looks sound, and the new tests cover the sequencing logic well.

Or, when there's nothing to report:

> Ready to merge. I checked the new query against the existing indexes, traced both callers of `formatDate`, and ran the unit tests listed in `AGENTS.md`: all passed. No findings.
