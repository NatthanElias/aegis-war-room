# Test policy

## Select tests

Write as many tests as verification needs. There is no quota. Commit every test named as a proof in `checks.md`. Each retained test must execute its assertions and distinguish the required behavior from a plausible fault.

Keep an extra test beyond the named proofs only when it catches a plausible fault that the other retained tests miss. Record the fault, focused command, failing assertion, and comparison with the other tests under `checks.md` `## Handoff`. Inject faults in scratch, never in the real checkout. Manual injection is the default. Use a mutation tool only when the repository already supplies it or the user approves adding it.

Prefer an observed failure before the fix as red evidence. When the implementation already exists, use a scratch fault to establish the test's value. Reuse evidence from the current build instead of repeating a run just to record it. A failure counts only when the intended assertion catches the fault, not when setup, collection, or an unrelated dependency fails.

Apply the checklist below before retaining a test. Repair a weak named proof rather than dropping it. Drop an uncommitted extra candidate that adds no fault detection or cannot pass the checklist. Record each dropped candidate and its reason in the [review round](execution-files.md#review-round).

Existing committed tests need a named reason and user approval before deletion or merging. The rule against weakening, deleting, skipping, or disabling tests to clear a gate still applies.

## Tautology checklist

Builders and verifiers apply all eleven checks to the feature's new or changed tests and every named proof, including extra tests proposed for commit.

| # | Reject this pattern | Required evidence |
| --- | --- | --- |
| 1 | A test nested inside another test that the runner never collects | Confirm the runner collects and executes the intended test. |
| 2 | Assertions behind a status guard that need not run, such as `if response.status == 200` | Assert the required status before checking its payload. |
| 3 | An expected value copied from the production constant or function being checked | Pin the expected contract independently. A wrong production value must fail the test. Reject an empty expected string that makes `includes("")` pass. |
| 4 | A loop or `all()` over a collection that may be empty | Assert the required count or members before applying per-item assertions. Assert an empty collection directly when emptiness is the requirement. |
| 5 | A sanitization test with no sensitive input, or no assertion that the sensitive value is absent | Supply a recognizable secret and assert its removal or redaction in the actual output. |
| 6 | An always-true predicate, such as a typed boolean being in `(True, False)` or a count being `>= 0` | Assert the required value or a boundary that a plausible wrong outcome violates. |
| 7 | Comparing a function with itself, such as `f(x) == f(x)` | Pin a concrete expected result. A determinism check may additionally compare repeated results. |
| 8 | Comparing a fixture with itself, such as one locale with that same locale | Compare the intended distinct inputs against independently specified expectations. |
| 9 | Skipping on the failure the test should catch, such as a regression returning 404 | Fail on that result. An unavailable prerequisite must be distinguished from the behavior under test. |
| 10 | Catching any exception when a specific error is required | Assert the expected exception type and the relevant code or message. An unrelated exception must fail. |
| 11 | An integration setup that never creates the state under test | Establish the prerequisite state before the action, then assert the resulting change. A cleanup test must first create something to clean up. |

A simple status assertion, a mock, a snapshot, or a repeated scenario at another layer is not inherently tautological. Review assertion precision and overlap separately. Keep independently pinned recorded output when it detects the claimed regression. Classify a test by what it can detect, not by its size or style.

## Choose the level

Prove a rule at the lowest layer that owns it. Use integration tests when the claim needs the real dependency or the interaction across a boundary. Examples include an index, a database validator, concurrency, server-side aggregation, or route wiring. Name the behavior the lower-level proof cannot establish. Similar assertions at different layers can protect different faults; similarity alone is not a deletion reason.

## Handle instability and cost

There is no fixed repeat-run requirement. If an unchanged test alternates between passing and failing, investigate the nondeterminism. A failure is not automatically flaky. Do not rerun until green or use quarantine to close a required proof. A proposed quarantine needs user approval, an owner, an expiry date, and a plan to restore coverage.

Run focused proofs per task or batch, then the required regression gates and final review. Keep the existing reviewer fault budget in [verify](verify.md). Builder faults do not replace reviewer faults. Measure or record gate duration, or set a time limit, only when the user or team requests it. Prefer fixing expensive setup or choosing the owning test level over discarding useful coverage.

## Review evidence

The verifier checks the builder's retention evidence and applies the checklist to all retained tests in scope, not only named proofs. A tautology or missing extra-test fault evidence blocks PASS until repaired or resolved. Explain precision and overlap findings without automatically labeling them tautologies.

Return `test_policy` in every new [review round](execution-files.md#review-round), including docs-only rounds. Set the checklist verdict to PASS only after inspecting the tests. Cite the reviewed tests and assertions in its evidence. When no tests are added, changed, or named as proofs, state that explicitly. List dropped uncommitted extra candidates with one reason each, or return an empty list when there were none. The validator checks this record's shape and sign-off, not whether the assertions are truthful or sufficient; that remains the reviewer's job.
