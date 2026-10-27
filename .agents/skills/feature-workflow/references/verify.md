# Verify

When implementation is ready, size and route the review by the "When to review independently" rules of the global `$orchestrate` skill, whether the code is committed or uncommitted. The files you give its delegation gate become the round's `review_files`. When the gate decides `local`, below its floor, the main session runs the review below itself, records `review_type: self`, and the summary says `Review: self-reviewed`. It still injects faults against its own tests, because without them a small change has no proof that its tests can fail. Otherwise each reviewer is a fresh `spec_verifier` agent with orchestrate's Verifier brief.

The verifier reads the current repositories and returns a record; the main session persists it. The verifier fixes no source, tests, documents, or review records. If the packet's HEAD or fingerprint differs from the checkout, return BLOCKED for stale evidence.

## Review

1. Compare the plan's binding sources, shape, and accepted criteria with the checks. For UI, inspect each named screen against its source or design for elements, copy, count, ordering, arrangement, and empty, loading, error, and unauthorized states. An uncovered or contradictory screen detail is a finding.
2. Run every named proof on the reviewed state. Confirm its named test actually ran. Locate the assertion and check its precise expected value, state, error, or payload field. Cite `path:line`; a passing suite or assertion that checks only presence is insufficient. Check that every numbered criterion has a check. Recompute each Coverage set from the source that owns it - the enum, the route table, the provider reference - rather than from the checks' own list, and confirm each member has the claimed proof. Re-read all nine Swept landings. Read [test policy](test-policy.md), apply its checklist to every retained test in scope, and verify extra-test fault evidence and dropped candidates. Apply project-specific Test policy rows where present. Check the comments in the changed code against [comments](comments.md). When the packet names a team standards skill or document, check the changed code against it too. List each breach with `path:line` among the ranked gaps. A team-standard or comment breach fails a check only when the plan made that rule a criterion.
3. Run repository build and regression gates and compare with the baseline. Explain skipped tests and count drops. Run the UI flow in the session's browser tool when `UI: yes`; return a screen evidence row with its binding source, observed result, and applicable states. For a behavior change, test one to three plausible wrong outcomes in scratch, scaled to risk. Use up to five for a critical path such as persisted fields, money, or a shared contract, and mark it critical in the round. Run each focused proof and record whether it caught the fault. Preserve the real checkout and compare its status before and after. A surviving mutation is FAIL.
4. Mark each check PASS, FAIL, GAP, or BLOCKED with expected, implementation, located assertion, observed result, and a structured result for every named proof command. Return the required `test_policy` sign-off and dropped-tests list in the round. Record the current hashes of `plan.md` and `checks.md` in the round. `[INFERRED]` cannot support PASS. Overall PASS needs every check proven, test policy satisfied, gates green, required mutations caught, UI evidence when applicable, and current fingerprints. A review that cannot run a required proof is BLOCKED or GAP, not PASS.

Run an interim review only at a high-risk irreversible, persisted-data, or shared-contract boundary, before consumers depend on it, sized and routed the same way. The final review still covers every check, including earlier builders' work and unchanged consumers affected by the change. After a FAIL, route gaps to the builder, save the failed round, and re-review the failed and affected checks plus every named proof on the new state. Mark each checkpoint in the new round `verified at <sha>` when you re-ran it on that HEAD, or `carried from <sha>` when the fix left it untouched. Recompute coverage or UI evidence touched by the fix. After three unsuccessful fix and review rounds, bring the recorded gaps to the user.

## Persist and gate

The main session writes the verifier's complete JSON unchanged to the next `execution/reviews/round-N.json` in the [record shape](execution-files.md). For a split review, merge the pieces' checkpoints into one round that lists every reviewer. A later review gets a new number. Never edit a saved round, and keep failed rounds.

Write `verification.md` as the [summary](execution-files.md) of the latest round.

Then run, from the repository root:

```bash
python3 .agents/skills/feature-workflow/scripts/validate_execution.py .specs/features/<feature> --stage complete
```

Report completion only on exit 0. The validator checks the saved PASS round, the review type and reviewer count its size requires, the size recomputed from `review_files`, all checks and their basis markers, gates, mutation or document checks, matching summary hash, and the current repository fingerprint. Process [lessons](lessons.md) after each saved round, including a failed one.
