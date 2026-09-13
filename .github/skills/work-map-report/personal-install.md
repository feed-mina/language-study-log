# Personal installation and sharing

Use this repository skill as the source template for other projects.

## Personal scope

Copy this directory to one of the following locations on the machine where you use Copilot:

- `~/.copilot/skills/work-map-report/`
- `~/.agents/skills/work-map-report/`

That makes the skill available across repositories for the same user environment.

## Repository scope

To share the same behavior with collaborators in another repository, copy this directory into:

- `.github/skills/work-map-report/`

inside that repository.

## Recommended operating model

1. Keep the canonical version of the skill in a repository you control.
2. Install it personally when you want the skill recognized across many repositories.
3. Copy or publish the same directory into selected repositories when teammates should get the same skill automatically there.

## Shared repository scaffold

This repository also includes a copy-friendly shared-skill scaffold at:

- `templates/work-map-report-skill-repo/`

Use that directory when you want to create a standalone public or shared skill repository with a `skills/` root and reusable adaptation docs.

## Notes

- Project skills are only recognized inside repositories that contain the skill directory.
- Personal skills are not shared with collaborators unless they install the skill too.
- A `copilot-setup-steps.yml` workflow is only needed when the skill depends on extra tools or packages that are not already present in the Copilot cloud agent environment.
