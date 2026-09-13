# Work Map Report Skill Repository Template

This directory is a copy-friendly scaffold for a standalone shared skill repository.

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

## How to use this scaffold

### Option 1: publish a shared skill repository

1. Copy this entire directory into a new repository.
2. Keep the `skills/work-map-report/` folder as-is.
3. Update `adaptation-checklist.md` and the example files for your organization or project patterns.
4. Install the skill into a local environment or another project from that repository.

### Option 2: copy into another repository directly

Copy `skills/work-map-report/` into one of these locations:

- `.github/skills/work-map-report/`
- `.claude/skills/work-map-report/`
- `.agents/skills/work-map-report/`

That makes it a repository-scoped skill for the target project.

### Option 3: install as a personal skill

Copy `skills/work-map-report/` into:

- `~/.copilot/skills/work-map-report/`
- `~/.agents/skills/work-map-report/`

That makes the skill available across projects for the same user environment.

## What to customize first

- default branch assumptions such as `main` or `master`
- evidence file paths that are specific to a repository
- workflow names used as report evidence
- report output directory and naming rules
- fallback rules when browser automation or external systems are unavailable

## Publishing guidance

This template is designed so the `skills/` directory can become the canonical source for a reusable skill repository, while individual projects can still copy the skill into `.github/skills/` when they want repository-local behavior.
