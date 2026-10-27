# Contributing a skill

This guide is for Oak engineers adding or changing an agent skill. It covers where guidance belongs, how to write and name a skill, the checks it must pass, and how it gets released.

A skill is a folder holding a `SKILL.md` file: YAML frontmatter, then Markdown instructions. Agents such as Claude Code, Codex, Cursor and Copilot list every skill's description at the start of a session, and load a skill's instructions only when its description matches the task in hand.

## Decide where the guidance belongs

Not everything belongs in a skill. Use this rule:

| Kind of guidance                                                                              | Where it goes                          | Why                                                                                                                                    |
| --------------------------------------------------------------------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Anything that changes when the code changes, such as commands, paths and the architecture map | The consuming repository's `AGENTS.md` | It's edited in the same pull request as the code.                                                                                      |
| How to do a kind of task, such as reviewing code or writing a pull request                    | A skill in this repository             | Skills refer to `AGENTS.md` for repository specifics, for example "run the test command listed in AGENTS.md", instead of copying them. |
| Anything a linter, formatter, type checker, template or CI check can enforce                  | That tool                              | A skill would only drift out of step with the tool.                                                                                    |

### One skill per kind of task

Guidance that's always used during the same task belongs in one skill, with the detail in its `references/` folder. For example, guidance on pull request descriptions and testing instructions lives in `oak-pr-create/references/` rather than in two more skills.

Every skill adds its description to the listing agents load at the start of each session, and similar skills compete for the same prompts. Fewer, broader skills keep the listing short and stop the wrong skill firing. Before adding a skill, check whether an existing one already covers the task. If it does, add a reference file to it instead.

## Where skills live

| Folder                        | What it holds                                                 | Name prefix                           |
| ----------------------------- | ------------------------------------------------------------- | ------------------------------------- |
| `skills/central/<name>/`      | Shared skills, available to every repository through profiles | `oak-`, such as `oak-pr-create`       |
| `skills/repos/<code>/<name>/` | Skills for one repository, its bundle                         | The repository's code, such as `owa-` |

A repository's code is the name of its folder under `skills/repos/`: two to four lowercase letters, such as `owa` for Oak-Web-Application, `oc` for oak-components and `ora` for oak-resource-adapter. A new repository folder needs a line in `.github/CODEOWNERS` naming its team and `@oaknational/skills-maintainers`.

This repository's own skills, such as `skill-authoring`, live in `.agents/skills/` and aren't published. They don't use the `oak-` prefix, which is only for published shared skills.

## Write the skill

### Naming

A skill's name must:

- match its folder name;
- start with its prefix, `oak-` or the repository's code and a hyphen;
- use only lowercase letters, digits and single hyphens, without a hyphen at the start or end;
- be at most 64 characters.

After the prefix, name the thing the skill works on, then what it does to it: `<prefix>-<object>-<verb>`, such as `oak-pr-create`, `oak-security-review` or `oak-ticket-start`. Leave out the object when the verb says it all, as in `oak-debug`. `validate` can't check this, so reviewers do.

Claude Code reserves the names `synced` and `anthropic-skills`, which the prefixes already rule out.

### Frontmatter

Use only these five fields. Agents silently ignore fields they don't recognise, so anything else would do nothing in some agents.

```yaml
---
name: oak-security-review
description: Threat-models a code change for security. Use when a change touches sign-in, permissions, user input or secrets, or when asked for a security review.
license: MIT
metadata:
  owner: '@oaknational/skills-maintainers'
  updated: '2026-10-13'
---
```

| Field           | Rules                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`          | As described above.                                                                                                                                               |
| `description`   | Required, at most 1,024 characters. Say what the skill does, then the kinds of request it's for. Put the key use first, because agents shorten long descriptions. |
| `license`       | Required. Use `MIT`, the licence of the package.                                                                                                                  |
| `compatibility` | Optional, at most 500 characters. Only for real environment needs, such as a tool the skill expects.                                                              |
| `metadata`      | Required. Every value is a string, so quote dates and team handles.                                                                                               |

`metadata` takes these keys:

| Key          | Required | Value                                                                                                          |
| ------------ | -------- | -------------------------------------------------------------------------------------------------------------- |
| `owner`      | Yes      | The GitHub team that owns the skill, such as `@oaknational/skills-maintainers`                                 |
| `updated`    | Yes      | The date the skill's files last changed, as `YYYY-MM-DD`. Change it whenever you change any file in the skill. |
| `deprecated` | No       | The name of the skill that replaces this one. See [deprecating a skill](#deprecate-a-skill).                   |
| `source`     | No       | Where a vendored skill came from, as `owner/repository@commit`. See [vendoring a skill](#vendor-a-skill).      |

Don't use `allowed-tools`. The Agent Skills specification marks it as experimental, and not every agent supports it.

### Body and references

- Keep the body of `SKILL.md` under 500 lines. Move detail into `references/`, which agents read only when they need it.
- Refer to other files with paths relative to the skill's folder, such as `[the checklist](references/checklist.md)`. Every file a skill refers to must exist, and inside the skill: a synced skill has only its own files.
- Refer to `AGENTS.md` for commands and paths rather than writing them into the skill.
- Write for an agent, in plain British English. Say what to do and when, with examples.

### Things a skill must never contain

- The `` !`command` `` syntax, at the start of a line or after a space, or a code block opened with ` ```! `. Claude Code runs both as shell commands before the skill reaches the model.
- A `.claude-plugin/` folder, which would make Claude Code load the skill as a plugin.
- Symlinks or other special files.
- Anything we wouldn't publish on our website, such as internal links, credentials or personal data. The package is public, and a published version can't be withdrawn.

## Fit within the description budget

Agents list skill descriptions within a budget: Claude Code and Codex both allow about 8,000 characters for common models, and shorten descriptions or leave skills out beyond it. Cursor and Copilot list each of our skills twice, because they read both folders a repository's skills are synced into.

So `validate` checks, for each bundle, that its descriptions plus every shared skill's description, counted twice, stay within 8,000 characters. If a change takes a bundle over, shorten descriptions or merge skills that do the same kind of task. The cap will be tuned during the pilot.

## Add the skill to a profile

A repository receives the shared skills in the profiles it subscribes to. Profiles are defined in `skills/profiles.json`:

```json
{
  "version": 1,
  "profiles": {
    "base": {
      "description": "Universal SDLC skills for every repository",
      "skills": ["oak-pr-create", "oak-security-review", "oak-sos-draft"]
    }
  }
}
```

- Every shared skill must belong to at least one profile, and a skill can belong to several.
- Only put a skill in `base` if it genuinely applies to every repository. Skills for some repositories go in a named profile, such as `frontend`, which is added when its first skill lands.
- Skills in a repository's bundle don't go in profiles. That repository always receives its whole bundle.

## Vendor a skill

To use a skill from elsewhere, vendor it: copy it once at a pinned commit, then maintain it here.

1. Copy the skill at a specific commit, not a branch.
2. Review its body and any scripts line by line, and check its licence allows us to publish it under MIT.
3. Rename it to follow our naming, and trim anything that doesn't apply to code.
4. Record where it came from in `metadata.source`, for example `oaknational/oak-ai-plugins@2a43cf1`.

We don't track later changes upstream.

## Deprecate a skill

To replace a skill with another:

1. Set `metadata.deprecated` to the replacement's name.
2. Start the description with `Deprecated:`, saying what to use instead.
3. Remove the skill after two minor releases or 60 days, whichever is later. The skills maintainers do this as part of a release.

`validate` checks that a deprecated skill's description starts with `Deprecated:` and that its replacement exists.

## Version the change with a changeset

The package has one version for every skill. Any change to `skills/`, `templates/` or `src/` needs a changeset, which records the change and the size of version bump it needs. Run `pnpm changeset`, choose the bump and write a one-line summary.

| Bump  | When                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------- |
| Major | A shared skill is removed or renamed, or its description changes what it fires on. Removing a skill from a profile is major too. |
| Minor | A new skill, shared or in a bundle, a change to when a bundle skill fires, or adding a skill to a profile                        |
| Patch | Wording changes that don't change when a skill fires                                                                             |

Until version 1.0.0, record breaking changes as minor, because Changesets would turn a major bump of a 0.x version into 1.0.0. Changes inside a repository's bundle are never major, because they only affect that repository.

## Check your work

Run the checks before opening a pull request:

1. `pnpm validate` checks every skill against the rules in this guide.
2. If you added, removed or renamed a skill, or changed a description or profile, run `pnpm readme:skills` to regenerate the skills table in `README.md`. `validate` fails if it's out of date.
3. `pnpm lint:md` and `pnpm spell` check the Markdown and spelling.

The git hooks run most of these on every commit, and CI runs all of them on every pull request.

## Review and release

Any engineer can propose a change, but only the skills maintainers can approve one. `.github/CODEOWNERS` names `skills-maintainers` as the only code owner, for shared skills, each repository's bundle, and everything else, such as the tool and workflows. GitHub asks them to review every pull request.

Pull requests are squash-merged, so give yours a [Conventional Commit](https://www.conventionalcommits.org/) title, such as `feat(oak-security-review): check for secrets in logs`. The pull request template asks the questions CI can't check.

Once merged, your change is released with the next version, usually within a week. Each consuming repository then receives it through a Dependabot pull request, which its team reviews before merging.
