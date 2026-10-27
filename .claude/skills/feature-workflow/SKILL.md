---
name: feature-workflow
description: "Plan, implement, verify, or resume an accepted feature across one or more selected repositories. Use for feature plans, impact and compatibility, checks, implementation, independent verification, or a .specs/features handoff."
---

# Feature workflow

Use [plan](references/plan.md) for a new substantive feature, [implement](references/implement.md) when its checks are ready, and [verify](references/verify.md) when implementation is ready. Read the full phase reference before acting. For advice or review without requested edits, use plan in read-only mode.

Load the global `/orchestrate` skill and follow it before dispatching the builder, the verifier, or parallel research, and before every review. Its delegation gate sizes the work and routes each review.

The always-on instructions are `CLAUDE.md` at the repository root. This port works in one Git repository, which those instructions record as `Repositories: single`, so feature artifacts carry no repository or checkout IDs. A multi-repository workspace needs the VS Code package's workspace-analysis, which this port does not ship.

A small change is one behavior change in at most three files, with no one-way door: no contract, schema, persisted-field, or cross-repository consumer change. In a monolith, a module's public interface is a contract too: a shared type, service method, or event that another module uses. A small change has no `plan.md`. Write `.specs/features/<feature>/checks.md` in the [execution files](references/execution-files.md#small-change) format, with `## Intent` holding its numbered EARS criteria, then build and review it like any feature. Its review still follows the global `/orchestrate` skill.

## Shared rules

- Before selecting tests, building, or reviewing, read [test policy](references/test-policy.md) for meaningful-test retention and the tautology checklist.
- New feature root: use the path in the always-on instructions, normally `.specs/features/<feature>/`.
- Load the team standards skill or document named in Team additions before planning, building, or verifying. If it cannot be loaded, stop and report the gap.
- Where a project has requirement or discovery documents, read them as sources and leave them unchanged. Keep accepted upstream IDs exactly as given. Feature-owned IDs may be added, never substituted for upstream IDs.
- Mark artifact claims `[CODE]` for observed code, configuration, or accepted artifacts; `[INTERPRETED]` for a conclusion drawn from named sources with reasoning; `[INFERRED]` for an assumption; and `[GAP]` for evidence sought but missing. An `[INFERRED]` claim cannot support PASS. Cite code as `path`, symbol, and approximate line; cite artifacts by their stable ID.
- Missing accepted requirements or critical evidence are `[GAP]`. Ask for the product decision before implementing behavior that depends on them.
- Never invent an API, a flag, a command or a behaviour. "I could not find documentation for this" always beats a plausible fabrication, because a fabrication propagates into the checks and then into a green test that proves nothing. Where nothing exists for what a check needs, ask - never invent a command, because a proof that cannot run is worse than none. A builder subagent cannot ask the user: it stops and returns the question, and the main session asks.
- An approved plan authorizes local edits and local commits. Before each commit, run `python3 .claude/skills/feature-workflow/scripts/check_commit.py --message "<message>"` and fix every error; no Git hook runs it for you. `git push`, force-push, deploy, and production data changes each need explicit approval for that action, even mid-build. So do new dependencies and new application branches. Never weaken, delete, skip, or disable a test to clear a gate.
- Section headings are a schema and stay in English, the prose follows the project, and identifiers are never translated.
- Skip a script only when no code-execution tool exists; then perform the same checks by reading the artifact and say once in chat that you are in the degraded path.

## Resume

Read `plan.md`, `checks.md`, `verification.md`, and `execution/handoff.md` where present. Capture the repository's current HEAD, status, and [fingerprint](references/execution-files.md#fingerprint). Compare these with the latest review round. The checkout and current instructions win over stale notes; a changed fingerprint makes earlier proof stale. Tell the user the current position and next step before editing.

## Package and finish

A substantive feature uses only `plan.md`, `checks.md`, `verification.md`, and immutable `execution/reviews/round-N.json`, plus `execution/handoff.md` when pausing. Keep other files only where an existing package already uses them. See [execution files](references/execution-files.md).

Feature folders under `.specs/features/` are git-ignored working files, so they never ride in a commit. Commit `.specs/constraints/`, `.specs/lessons/`, and `.specs/LESSONS.md`, which the team shares. A new or superseding constraint record rides in its feature commit; run `python3 .claude/skills/feature-workflow/scripts/constraints.py check` before each commit and at completion. Commit lesson changes in their own `chore(specs): ...` commit, not in a feature commit. [Constraints](references/constraints.md) defines the records coding agents follow.

The feature is complete only after the review its size requires has returned PASS for every check on the current repository fingerprint, the main session has saved the round and matching summary, and the complete-stage validator passes. Process [lessons](references/lessons.md) from the saved round, update affected living docs, and report any remaining approvals.

## Maintain the skill

After editing a script in `scripts/` or a format in `references/`, run `python3 .claude/skills/feature-workflow/scripts/selftest.py` and keep it at 0 survived. Its fixtures in `scripts/fixtures/` are the worked example of a passing feature. Parts of this skill adapt tlc-spec-lean under CC-BY-4.0; [ATTRIBUTION.md](ATTRIBUTION.md) lists the changes.
