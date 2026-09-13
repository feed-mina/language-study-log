# Example adaptation: language-study-log

This example shows how the generic `work-map-report` skill can be adapted for the `feed-mina/language-study-log` repository.

## Repository facts

- default branch: `main`
- report output directory: `work-map-guide/`
- active repository skill path: `.github/skills/work-map-report/`

## Evidence sources used in this repository

- `.github/workflows/sync-study-logs.yml`
- `scripts/study-log-to-sql.ts`
- `worker/api.ts`
- `app/page.tsx`
- `worker/study-log-sync.test.ts`

## Repository-specific expectations

- Study-log evidence often starts with files under `study-logs/YYYY/MM/DD/`.
- `Sync ChatGPT study logs` workflow runs can be cited as report evidence when the run numbers are verified.
- If browser tooling is blocked, static JSON or JavaScript verification and secret scanning can still support the report.

## Reuse note

When copying this skill to another repository, replace these evidence paths and expectations with equivalents from that repository before relying on the skill.
