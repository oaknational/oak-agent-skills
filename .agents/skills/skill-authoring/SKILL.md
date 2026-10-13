---
name: skill-authoring
description: Writes or changes an agent skill in the oak-agent-skills repository so it follows Oak's rules on placement, naming, descriptions, the description budget, size, profiles, metadata and versioning. Use when asked to create, edit, rename, split, merge, deprecate or review a skill here.
license: MIT
metadata:
  owner: '@oaknational/skills-maintainers'
  updated: '2026-10-13'
---

# Skill authoring

Write skills that agents load at the right moment and follow well, in every repository that receives them. The full rules are in [the guide to contributing a skill](../../../docs/contributing-a-skill.md). This skill is the working checklist.

## 1. Decide whether it should be a skill

- Guidance that changes with the code, such as commands, paths or the architecture, belongs in a consuming repository's `AGENTS.md`, not a skill.
- Anything a linter, formatter, type checker or CI check can enforce belongs in that tool.
- Keep to one skill per kind of task. Read the existing skills in `skills/central/` and the relevant `skills/repos/<code>/` first. If one already covers the task, add a file to its `references/` folder instead of a new skill.

## 2. Place and name it

- A shared skill goes in `skills/central/<name>/`, and its name starts with `oak-`.
- A skill for one repository goes in `skills/repos/<code>/<name>/`, and its name starts with that code and a hyphen, such as `owa-`.
- Names use lowercase letters, digits and single hyphens, at most 64 characters, and match the folder name.

## 3. Write the frontmatter

Use only these fields:

```yaml
---
name: oak-example
description: What the skill does, then the kinds of request it's for. Use when ...
license: MIT
metadata:
  owner: '@oaknational/skills-maintainers'
  updated: 'YYYY-MM-DD'
---
```

- Set `metadata.owner` to the owning team: the engineering team for shared skills, or the repository's team for a bundle.
- Set `metadata.updated` to today's date whenever any file in the skill changes.
- Quote every `metadata` value, because each must be a string.
- Don't add `allowed-tools` or any other field.

## 4. Write the description

The description decides when agents load the skill, so it matters more than any other line.

- Say what the skill does, then when to use it, naming the requests and words people actually use.
- Put the main use first: agents shorten long descriptions.
- Keep it well under 1,024 characters. Every description counts against the budget agents allow for the whole skill listing, and `validate` caps each bundle plus the shared skills at 8,000 characters, counted twice.
- Make sure it doesn't overlap with another skill's description, or the two will compete for the same prompts.

## 5. Write the body

- Keep `SKILL.md` under 500 lines, and move detail into `references/`, which agents read only when needed.
- Refer to other files by paths relative to the skill's folder, and only to files inside the skill.
- Refer to `AGENTS.md` for the consuming repository's commands and paths rather than writing them in.
- Write instructions for an agent: what to do, in what order, and how to report the result. Use plain British English.
- Never write an exclamation mark directly before a backtick at the start of a line or after a space, and never open a code block with an exclamation mark after the backticks. Claude Code runs both as shell commands before the skill reaches the model.
- Never include secrets, personal data, internal links, symlinks or a `.claude-plugin/` folder. The package is public.

## 6. Wire it in

1. Add a shared skill to at least one profile in `skills/profiles.json`. Put it in `base` only if it applies to every repository.
2. For a new repository code, add a line for `/skills/repos/<code>/` to `.github/CODEOWNERS`, naming its team and `@oaknational/skills-maintainers`.
3. Run `pnpm readme:skills` to regenerate the skills table in `README.md`.
4. Add a changeset with `pnpm changeset`. Use patch for wording that doesn't change when a skill fires, minor for a new skill or a change to when it fires, and record breaking changes as minor until version 1.0.0.

## 7. Check it

Run `pnpm validate`, `pnpm lint:md` and `pnpm spell`, and fix everything they report. Then read the skill as an agent would: would it load for the requests it's meant for, and not for others?

## Other changes

- **Deprecating:** set `metadata.deprecated` to the replacement's name and start the description with "Deprecated:".
- **Vendoring:** copy the skill at a pinned commit, review every line and its licence, and record the origin in `metadata.source` as `owner/repository@commit`.
- **Removing or renaming a shared skill** is a breaking change for every repository that receives it. Discuss it with the skills maintainers first.
