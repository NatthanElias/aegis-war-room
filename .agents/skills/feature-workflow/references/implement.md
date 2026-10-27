# Implement

The builder closes the accepted checks. Order, code placement, and reversible design details follow the repository's conventions. The checks and their named proofs stay fixed unless the user approves a visible change. The builder reports proof results, changed files, deviations, and unresolved checks, then stops.

## Before editing

Run the [resume](../SKILL.md#resume) reconciliation if work exists. Confirm a usable baseline. Load confirmed [lessons](lessons.md) for the project and repository. Read each changed code path and its callers.

Complete `checks.md` first in the format from [execution files](execution-files.md). Find real commands in repository instructions, manifests, and CI. Run `python3 .agents/skills/feature-workflow/scripts/validate_execution.py .specs/features/<feature> --stage checks`.

The builder budget is the ceiling of the global `$orchestrate` skill's delegation gate. For each vertical slice, run the gate on the files the slice touches. Pack whole slices in order and prefer a cut where the surface changes. When the gate decides `local` for the total, the main session builds and later reviews its own work. When it decides `delegate`, dispatch one `task_worker` builder and continue without asking; the main session keeps its context for the review dispatch. When it decides `split_required`, propose the cut and ask the user to choose sequential green handoff or one builder with compaction accepted. A slice that alone exceeds the ceiling is too coarse; revise that slice before choosing a mechanism. Record the arithmetic and choice under `## Handoff` in `checks.md`.

## Build cycle

1. Read [test policy](test-policy.md) before selecting tests. Derive tests from the check's stated value, state, error, or payload field. Include failure paths and affected existing behavior. In an area with no tests, characterize current behavior before changing it. Given/When/Then scenarios should name the input, action, and observable result. Extend an existing test before creating one. Apply the policy's retention rule and tautology checklist, and record red evidence and dropped extra candidates. Builder fault injection stays in scratch.
2. Implement the smallest change that passes the named proof. Follow current patterns. Write and update comments by [comments](comments.md). Keep unrelated refactoring out of the diff. Keep Flow and Impact accurate as work changes. Add a newly discovered one-way decision to Landing as a new row before writing the code that closes it; approved rows are append-only. Changed accepted requirements or contracts go back to the user.
3. Run focused proofs, then the relevant build and full regression gates. Record each command with its working directory, exit code, and run, failed, and skipped counts for the review packet. A new failure or lower test count needs a fix or a named baseline exception. A red gate does not close a check.
4. Inspect each proof's assertion against the concrete claim. A call count, non-null result, or broad green suite alone does not settle a value. Record a precision gap instead of guessing.
5. Update affected living docs and the package's existing `sync-log.md` if it has one. Write living-doc updates in plain sentences a developer can review and merge, without compressed shorthand. Leave historical discovery snapshots unchanged. Record any deviation from a criterion as `SPEC_DEVIATION` for the verifier.
6. Commit the green slice locally in Conventional Commits form. Run `python3 .agents/skills/feature-workflow/scripts/check_commit.py --message "<message>"` first and fix every error. The feature folder is git-ignored, so the commit carries code, tests, and living docs only.

In a [greenfield first feature](plan.md#greenfield-first-feature), the last slice hands the new build and test commands to setup as the plan section says.

Keep other people's uncommitted changes intact: never revert, stash, reset, or switch branches. Record an out-of-scope defect for follow-up. A red proof is a stop, not a note. If an approved check, or an approved Landing row, proves wrong or impossible, stop the build and ask the user before changing it. A builder subagent stops and returns the question with its evidence; the main session asks the user.

If the user chose sequential handoff, stop each batch only when its proofs and gates are green, then add its entry to `checks.md` `## Handoff`. The next builder reads the checks and actual diff, then continues with the next whole slice. After compaction, reread checks and the diff.

When implementation is ready, or at a high-risk boundary named in [verify](verify.md), the main session starts the review that [verify](verify.md) sizes.
