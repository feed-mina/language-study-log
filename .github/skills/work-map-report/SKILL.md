---
name: work-map-report
description: Create a work-map-guide HTML report for completed tasks. Use when asked to summarize finished work, generate a work-map-guide report, verify study-log sync evidence, or carry progress history across projects.
license: MIT
---

# Work map report

Generate a `work-map-guide/*.html` report that explains what was verified, what changed, and which limits applied during the task.

## When to use this skill

Use this skill when the user asks for any of the following:

- a `work-map-guide` HTML report
- a final task summary with evidence
- a reusable completion report for this or another project
- accumulated progress history across projects

## Required behavior

1. Verify the task facts before writing the report. Do not invent evidence.
2. Prefer repository files, Git metadata, and GitHub workflow results as evidence.
3. Use absolute repository paths in the report when file paths matter.
4. If the task mentions CI, workflow, build, or test status, use GitHub Actions tools to verify the run status and logs.
5. If browser automation is unavailable, explicitly record that limitation and fall back to static file, JSON, JavaScript, and secret-scan based verification.

## Evidence collection order

Follow this order unless the user asks for a narrower scope.

1. Confirm branch state and whether the current branch matches `origin/main` when that claim appears in the report.
2. Confirm the expected study-log files exist for the target date under `study-logs/YYYY/MM/DD/`.
3. Confirm the sync workflow behavior from:
   - `/home/runner/work/language-study-log/language-study-log/.github/workflows/sync-study-logs.yml`
4. Confirm parsing and D1 upsert behavior from:
   - `/home/runner/work/language-study-log/language-study-log/scripts/study-log-to-sql.ts`
5. Confirm materials API exposure from:
   - `/home/runner/work/language-study-log/language-study-log/worker/api.ts`
6. Confirm UI rendering expectations from:
   - `/home/runner/work/language-study-log/language-study-log/app/page.tsx`
7. Confirm automated coverage from:
   - `/home/runner/work/language-study-log/language-study-log/worker/study-log-sync.test.ts`
8. Confirm workflow run success for `Sync ChatGPT study logs` when the report mentions run numbers.

## Report output requirements

Create an HTML file under `work-map-guide/` with a timestamped filename.

The report must include:

- task title or purpose
- checked branch or commit state
- verified evidence sources
- confirmed workflow runs and outcomes
- validation scope
- limitations or blocked tools
- final artifact path

If prior work-map history is available, append or summarize it instead of replacing it.

## Cross-project reuse

- For repository scope, keep this skill in `.github/skills/work-map-report/`.
- For personal cross-project reuse, copy this entire directory to `~/.copilot/skills/work-map-report/` or `~/.agents/skills/work-map-report/`.
- Project skills do not automatically propagate to other repositories. Reuse requires a personal installation or copying the skill into each repository.

See `personal-install.md` in this directory for the recommended sharing pattern.
