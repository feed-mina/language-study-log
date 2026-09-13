# Publish and install with GitHub CLI

Use this guide when you turn the scaffold into a dedicated shared skill repository.

## 1. Publish the repository

Create a repository whose root contains:

```text
README.md
skills/
  work-map-report/
    SKILL.md
    adaptation-checklist.md
    publish-and-install.md
    examples/
      language-study-log.md
```

The `skills/` directory should stay at repository root so GitHub CLI can discover the skill cleanly.

## 2. Prepare the public README

Before publishing, update the top-level `README.md` to include:

- the repository purpose
- the skill name: `work-map-report`
- the expected installation methods
- whether the repository is public, internal, or private
- who maintains the skill

## 3. Preview before installing

Users should inspect the skill first:

```bash
gh skill preview OWNER/REPOSITORY work-map-report
```

This is the safest default for a public repository because it lets users read the skill contents before installation.

## 4. Install the skill

### Install at project scope

```bash
gh skill install OWNER/REPOSITORY work-map-report
```

Use this when the skill should apply only in the current project context.

### Install at user scope

```bash
gh skill install OWNER/REPOSITORY work-map-report --scope user
```

Use this when the skill should be recognized across many repositories for the same user environment.

### Install and pin a version

```bash
gh skill install OWNER/REPOSITORY work-map-report --pin TAG
```

Pinning is useful when you want stable behavior across repeated tasks.

## 5. Update installed copies

To check for or apply upstream changes later:

```bash
gh skill update work-map-report
```

Or update all installed skills:

```bash
gh skill update --all
```

## 6. Copy into repositories when needed

Even with a shared source repository, some teams may prefer a repository-scoped copy:

- `.github/skills/work-map-report/`
- `.claude/skills/work-map-report/`
- `.agents/skills/work-map-report/`

Use that model when the target repository needs local customization or when collaborators should get the skill from version control without separate installation.

## 7. Versioning suggestion

If this becomes a real shared repository, use tags or releases when the skill behavior changes in a meaningful way.

That makes pinned installs such as `gh skill install OWNER/REPOSITORY work-map-report --pin TAG` easier to use and review.
