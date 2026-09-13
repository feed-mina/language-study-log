# Work Map Report Skill Repository Template

This directory is a copy-friendly scaffold for a standalone public or shared GitHub Copilot skill repository.

It is designed for the case where you want one canonical repository that:

- publishes a reusable `work-map-report` skill
- can be installed with `gh skill install`
- can still be copied into `.github/skills/` inside individual repositories

## Recommended structure

```text
skills/
  work-map-report/
    SKILL.md
    adaptation-checklist.md
    examples/
      language-study-log.md
README.md
```

## Recommended repository purpose

If you split this template into its own repository, that repository becomes the canonical source for your shared reporting skill.

Recommended audience:

- you want the same completion-report skill across many repositories
- you want a public or internal repository that teammates can inspect before installing
- you want `gh skill preview` and `gh skill install` to work against a stable source repository

## How to use this scaffold

### Option 1: publish a shared skill repository

1. Copy this entire directory into a new repository.
2. Keep the `skills/work-map-report/` folder as-is.
3. Update `adaptation-checklist.md` and the example files for your organization or project patterns.
4. Adjust this README so it names the real repository owner, scope, and support policy.
5. Install the skill into a local environment or another project from that repository.

### Option 2: copy into another repository directly

Copy `skills/work-map-report/` into one of these locations:

- `.github/skills/work-map-report/`
- `.claude/skills/work-map-report/`
- `.agents/skills/work-map-report/`

That makes it a repository-scoped skill for the target project.

### Option 3: install as a personal skill

Copy `skills/work-map-report/` into:

- `~/.copilot/skills/work-map-report/`
- `~/.claude/skills/work-map-report/`
- `~/.agents/skills/work-map-report/`

That makes the skill available across projects for the same user environment.

### Option 4: install with GitHub CLI

After publishing the scaffold as its own repository, users can install it with GitHub CLI.

Preview first:

```bash
gh skill preview OWNER/REPOSITORY work-map-report
```

Install for the current project:

```bash
gh skill install OWNER/REPOSITORY work-map-report
```

Install for personal cross-project reuse:

```bash
gh skill install OWNER/REPOSITORY work-map-report --scope user
```

Install and pin a version:

```bash
gh skill install OWNER/REPOSITORY work-map-report --pin TAG
```

Update later:

```bash
gh skill update work-map-report
```

For a fuller publishing and installation flow, see `skills/work-map-report/publish-and-install.md`.

## What to customize first

- default branch assumptions such as `main` or `master`
- evidence file paths that are specific to a repository
- workflow names used as report evidence
- report output directory and naming rules
- fallback rules when browser automation or external systems are unavailable

## Publishing guidance

This template is designed so the `skills/` directory can become the canonical source for a reusable skill repository, while individual projects can still copy the skill into `.github/skills/` when they want repository-local behavior.

## Suggested README sections for the final public repository

When you publish a dedicated shared-skill repository, keep or adapt these sections:

- what the skill does
- when Copilot should invoke it
- installation methods
- trust and review guidance
- repository adaptation points
- versioning or release policy
- example repositories that use the skill

## Trust and review note

If you publish this as a public repository, keep the skill easy to inspect.

- Prefer Markdown guidance over opaque automation.
- If you add scripts later, document them clearly in `SKILL.md`.
- Ask users to run `gh skill preview` before installation.
