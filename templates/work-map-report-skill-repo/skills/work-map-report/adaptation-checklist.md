# Adaptation checklist

Update these items when copying the skill into a new repository.

## Repository facts

- repository name
- default branch name
- report output directory
- report filename convention

## Evidence sources

Replace generic placeholders with the real files and workflows that prove the task outcome, for example:

- workflow definitions under `.github/workflows/`
- scripts that validate or transform source data
- API or worker entry points
- UI files that expose the result
- tests that prove the behavior

## Validation rules

Define:

- which tests or checks count as required
- which checks may be skipped for documentation-only changes
- what to do when browser tooling is blocked
- what to do when CI access is unavailable

## Output rules

Define:

- whether reports accumulate prior history or only summarize the current task
- whether the report must include absolute paths for local debugging or only relative paths for portability
- whether the skill should generate a new report file each time or update an index/history page too

## Sharing model

Choose one:

1. Personal skill only
2. Repository-scoped copies in selected repositories
3. Standalone shared skill repository as the canonical source, plus optional repository-scoped copies
