# Testing instructions

Testing instructions let a reviewer check the change for themselves. Write them so that someone who hasn't seen the work can follow them without help and know whether what they see is right.

## What to include

1. **Where to test.** A preview deployment, a local set-up, or a particular environment. If it's local, point to the set-up commands in `AGENTS.md` rather than repeating them.
2. **What you need first.** An account type, a feature flag, test data or a configuration setting.
3. **Steps.** Numbered, one action per step, using the names people see on screen or the exact command to run.
4. **Expected results.** After each step that matters, what the reviewer should see. Be specific: "The lesson list shows three lessons", not "it works".
5. **Edge cases.** One or two steps that try the unusual paths: an empty state, an error, a long name, a slow network.

## Good instructions

```markdown
1. Open the preview deployment and sign in as a teacher.
2. Go to **My lessons** and select **Create lesson**.
3. Leave the title empty and select **Save**.
   - The error "Enter a lesson title" appears under the title field, and focus moves to it.
4. Enter "Fractions" as the title and select **Save**.
   - You return to **My lessons**, and "Fractions" is at the top of the list.
```

## Weak instructions

> Check the create lesson page works.

This doesn't say where to go, what to do or what "works" means, so every reviewer tests something different.

## Interface changes

For changes people see:

- Test with a keyboard as well as a mouse, and say what you checked, such as focus order and visible focus.
- Mention screen sizes you checked, such as a phone and a desktop.
- If a skill for accessibility review is available, such as `oak-accessibility-review`, follow it for interface changes.
- Give any screenshots alt text that says what they show.

## Changes with no visible effect

For a refactor, a dependency upgrade or a back-end change, the instructions might be the commands to run and what their output should show. Say how a reviewer can tell the behaviour hasn't changed, such as which tests cover it.
