---
name: workflow-setup
description: Interview the team and install or reconfigure the project workflow for OpenCode. Use when setting up a repository, changing team choices, or after reinstalling the project skills.
disable-model-invocation: true
---

# Workflow setup

Setup writes `AGENTS.md`, the always-on instructions OpenCode loads, from the team's choices in `docs/harness/setup-selection.json`. Codex also reads `AGENTS.md`. Its workflow-setup port renders the same harness-neutral text from the same selection, so either setup gives the same file; after a selection change, rerun both so each ownership record stays current. Claude Code reads `CLAUDE.md`, which its own port writes. This port supports one Git repository. Setup never commits.

## 1. Confirm the repository

Confirm that the repository root is a Git repository. If it is not, ask the team before running `git init`. Use the current checkout; the user supplies the correct branch. Never switch branches or revisions, create a branch, or ask the team to choose a commit. Record the current HEAD only as evidence. The repository ID is its folder name unless the team gives another; confirm it with the `question` tool.

A workspace that spans several repositories needs the VS Code package's workspace-analysis, which this port does not ship. Tell the team, and stop.

Done when the team has confirmed the repository root and its ID.

## 2. Read and interview

Read the repository's instructions, manifests, CI files, document indexes, and `docs/harness/setup-selection.json` when present. Suggest the brief, the repository row, task routes, and the check command from them. A new repository with no build or test command records its check as a validation gap; its first feature adds the commands. Ask only for decisions the team owns.

The project skills in `.opencode/skills/` are the candidates: `workflow-setup`, `generate-roadmap`, and `feature-workflow`. Setup uses the global `@grill-me` skill, and feature-workflow uses the global `@orchestrate` skill. Setup warns when either is missing from this machine. Select `feature-workflow` only when the team wants it.

Find the team standards skill or document and propose a Team additions line that names it. When none exists, tell the team to supply one, and offer `@writing-for-agents` to turn their standards into a skill.

Load `@grill-me` for the interview, with three changes:

- Recommend the suggestions above and the default where one exists.
- Offer defer or skip on every optional choice.
- End the interview when each setting is accepted, deferred, or skipped: project ID, repository ID, skills, feature document location, check command or gap, delegation, authoritative documents, brief, repository row, and task routes. Reuse an existing project ID or propose a lowercase ID from the project name. The team confirms, edits, or drops each suggested route.

Leave commit policy out of the interview. Preserve an existing policy; otherwise use "Local commits under an approved plan; push, force-push, deploy, and production data need explicit approval". Review routing is fixed in the global orchestrate skill, so leave it out too. Team policy takes priority over a default. When two applicable instructions conflict, show the conflict and let the team resolve it.

### Team choices and personal choices

Team choices govern shared work: project ID, repository ID, enabled skills, feature-document location, checks, delegation, authoritative documents, brief, repository role, and task routes. Record accepted choices in the selection and show the exact merged preview before apply. Shared one-line additions, including the team standards line, belong in `## Team additions` outside setup's marked parts.

Personal choices affect only the requesting developer: preferred response language, explanation length, editor habits, or model preferences within the team's delegation rules. Store them in `.local/` only when requested, and keep them out of `AGENTS.md` and the selection. Personal preferences cannot relax team checks, review requirements, or approval gates.

## 3. Write the selection

Write the accepted choices to `docs/harness/setup-selection.json`:

```json
{"project": "catalog", "single_repository": true, "selected_repositories": ["catalog-api"],
 "brief": "Catalog API stores product records.\nIts web client edits them over HTTP.",
 "repositories": {"catalog-api": {"role": "Product records", "start": "src/"}},
 "routes": [{"task": "Change product intake", "start": "src/intake/"}],
 "skills": ["workflow-setup", "generate-roadmap", "feature-workflow"],
 "checks": {"catalog-api": "npm test"}, "feature_root": ".specs/features/<feature>/",
 "delegation": "Helpers allowed; parallel writes not allowed",
 "commits": "Local commits under an approved plan; push, force-push, deploy, and production data need explicit approval",
 "documents": {"Architecture": "docs/architecture/"}, "deferred": ["model preference"]}
```

- `single_repository` is `true` and `selected_repositories` names exactly one ID matching `[A-Za-z0-9][A-Za-z0-9._-]*`.
- Leave out `skills` to select every project skill installed in `.opencode/skills/`.
- Use a lowercase project ID matching `[a-z0-9][a-z0-9-]*`.
- Keep `brief` to 1 to 5 lines. Roles and tasks are single table cells without newlines or `|`. Start paths are relative to the repository root and must exist; use forward slashes and no `..`, colons, or backticks.
- `package_source` belongs to the VS Code package sync, and setup refuses it.

The selection holds team choices only, so every harness's setup reads the same file. Done when the selection records only accepted choices and all start paths exist.

## 4. Preview and apply

From the repository root, preview the changes:

```text
python3 .opencode/skills/workflow-setup/scripts/setup.py docs/harness/setup-selection.json
```

Show the exact merged preview to the team. After they accept it, run the same command with `--apply`. Apply writes `AGENTS.md`, records hashes of its marked parts and the selection in `docs/harness/setup-ownership.opencode.json`, and adds `.local/` to `.gitignore`. With feature-workflow selected it also adds the feature folder root, normally `.specs/features/`; `.specs/constraints/`, `.specs/lessons/`, and `.specs/LESSONS.md` stay committed. When the project still holds feature-workflow's retired decisions table, setup prints a notice to convert it with feature-workflow's `constraints.py migrate`. A change the team already approved exactly as shown needs no second approval.

`AGENTS.md` holds the brief, repository table, task routes, checks, and team rules, and stays under 120 lines. Each generated body sits between `<!-- setup:<name> -->` and `<!-- /setup:<name> -->` markers, in the order `brief`, `repositories`, `routes`, `checks`, `team`. Setup owns only the marked bodies and keeps every other line, including `## Team additions`, verbatim. An edit inside a marked part conflicts when its body differs from both the proposal and the last applied body; a file without markers conflicts unless setup wrote it. On a conflict, setup keeps the file, shows the proposal, and exits non-zero. Move the edit into Team additions or the selection, then rerun.

Done when the team has approved the preview and setup has applied that exact proposal without conflicts.

## 5. Validate

```text
python3 .opencode/skills/workflow-setup/scripts/setup.py docs/harness/setup-selection.json --validate
```

Setup is done when it prints `Configuration OK`.

## Sync the skills

These project skills come from the `opencode/project/` collection of the skills repository. To update them, reinstall from that repository with `python3 scripts/install_project.py --harness opencode --root <repository>`, then rerun the preview and apply. An edit to an installed skill file is an override: list it in `## Team additions` as `- Override <skill>/<file>: <reason>.`, and reapply it after reinstalling. Give the team the commit message `chore: sync project skills`; setup never commits.
