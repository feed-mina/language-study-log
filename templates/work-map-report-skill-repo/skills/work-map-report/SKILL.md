---
name: work-map-report
description: Create an HTML completion report with verified evidence, validation scope, and environment limits. Use when asked to summarize finished work, generate a work-map report, verify task evidence, or carry progress history across projects.
license: MIT
---

# Work map report

Create a portable HTML report that explains what was completed, what was verified, and what limitations affected the task.

## When to use this skill

Use this skill when the user asks for:

- a work-map or completion HTML report
- a final summary backed by repository evidence
- accumulated progress history across tasks or projects
- a reusable end-of-task reporting flow

## Required behavior

1. Verify facts before writing the report.
2. Prefer repository files, Git metadata, test results, and GitHub workflow results as evidence.
3. Use repository-relative paths in the report so the artifact stays portable.
4. Record blocked capabilities, skipped checks, and fallback validation methods explicitly.
5. If the task mentions CI, builds, tests, or workflows, verify them with GitHub Actions tooling rather than guessing.

## Evidence collection process

1. Identify the task scope and target branch or commit.
2. Confirm files, tests, workflows, and artifacts relevant to the completed task.
3. Read repository-specific expectations from `adaptation-checklist.md`.
4. If available, compare the findings against repository examples in the `examples/` directory.
5. Generate an HTML report under the repository's chosen output directory.

## Required report sections

The HTML report should include:

- task purpose
- branch or commit state
- evidence sources consulted
- workflow, test, or validation results
- environment limitations
- final outputs and their locations
- carry-forward notes or progress history, if requested

## Adapting to a repository

Before first use in a new repository, customize the repository-specific parts listed in `adaptation-checklist.md`.
