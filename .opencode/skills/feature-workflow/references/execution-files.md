# Execution files

## Checks

Derive `checks.md` from the accepted plan before touching code. First run the [constraints](constraints.md) `list` for the areas and paths the plan touches, and conform to each record or supersede it. Every criterion must map to at least one check. Group checks by the plan's vertical slices, numbering across the feature. Each check makes one concrete observable claim and names a focused proof from the repository's actual test setup. If one proof cannot settle the claim, name the others. A check about a boundary needs a proof that crosses it; a decision table needs its members asserted at the deciding layer.

```markdown
# <Feature> checks

UI: no

## Checks

### S1 - Reject expired coupons

**C1** - [CODE] A coupon that expired on January 31 is rejected at checkout on February 1 (REQ-12-AC1).
Criteria: 1
Proof: `python -m pytest tests/coupons/test_rules.py::test_rejects_expired_coupon`

**C2** - [CODE] A coupon that expires on the checkout date is accepted (REQ-12-AC2).
Criteria: 2
Proof: `python -m pytest tests/coupons/test_rules.py::test_accepts_coupon_on_expiry_date`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| expiry boundary (2) | before checkout C1 · on checkout date C2 | - |

## Swept

- validation: C2
- failure modes: existing - named error handler
- idempotency: n/a - no retryable action
- authorization: existing - named guard
- concurrency: n/a - read-only rule
- data lifecycle: C1
- dependency failure: existing - named fallback
- state transitions: n/a - no mutable state
- observability: existing - named checkout metric

## Test policy

None - `rules.is_valid` is one date comparison already proven at its own layer.

## Handoff

- S1 touches the coupon rules module (12,000 bytes) and its test (8,000 bytes): (12,000 + 8,000) / 4 = 5,000 tokens.
- Total 5,000 tokens: the delegation gate decides `local`, so the main session builds it and reviews it itself.
```

Use `UI: yes|no`. Each check names its criteria on a `Criteria:` line and its proofs on `Proof:` lines.

The shared [test policy](test-policy.md) always applies. Write project-specific `## Test policy` rows only when changed code decides something and repository guidance does not say both which level proves deciding code and how much input space each proof must assert. Classify decision code by branches, mappings, guards, and transitions; name the rows and the closest tested analogue. Pass-through instrumentation may rely on its consumer's proof. Record the policy and its cost before building. When no changed code decides, write `None - <why>`.

`## Coverage` joins every enumerated set member to a check. Include route statuses, decision branches, transitions, boundaries, shared assemblies, and any set named in a claim or the plan's Surface, Relations, or Landing. A table-driven proof can cover a full set when its test enumerates every member; write the set size in its cell, as in `C2, table-driven over all 9`. State set size and each member; `Unproven` is `-` only when none remain.

`## Swept` always accounts for all nine dimensions shown above. Each line cites a check, current behavior with a named mechanism, or `n/a` with a reason. It exposes omissions without inventing requirements. `## Handoff` records the slice sizing and builder choice from [implement](implement.md), then each completed handoff boundary, decisions settled mid-build, and abandoned approaches.

Run `python3 .opencode/skills/feature-workflow/scripts/validate_execution.py .specs/features/<feature> --stage checks`.

## Small change

A small change has no `plan.md`. Its `checks.md` adds `## Intent` before `## Checks`: one or two sentences on the problem, then the numbered EARS criteria the checks cite, with an upstream ID beside each when one exists. `Lands in:` lines and append-only rows do not apply. Everything else in the format above does, and the review markers below apply to its rounds. Validate it with `--stage checks`; the plan stage refuses a folder without `plan.md`.

```markdown
## Intent

Checkout still accepts a coupon after its expiry date.

1. WHEN a customer applies a coupon after its expiry date THEN checkout SHALL reject the coupon (REQ-12-AC1)
```

## Review round

The verifier's record, saved as `execution/reviews/round-N.json`, has this shape:

```json
{
  "feature_id": "coupon-expiry-date",
  "project": "shop",
  "repository": "orders-api",
  "round": 1,
  "kind": "behavior",
  "ui": "no",
  "review_files": ["src/coupons/rules.py", "tests/coupons/test_rules.py",
                   ".specs/features/coupon-expiry-date/plan.md", ".specs/features/coupon-expiry-date/checks.md"],
  "review_tokens": 48000,
  "review_type": "independent",
  "author": "builder:<session id>",
  "reviewer": "spec-verifier:<session id>",
  "verdict": "PASS",
  "plan_sha256": "<sha256 of plan.md>",
  "checks_sha256": "<sha256 of checks.md>",
  "repositories": [
    {"head": "<full sha>", "fingerprint": "<full sha256>"}
  ],
  "checkpoints": [
    {
      "id": "C1", "source": "plan.md#Criteria-1",
      "expected": "[CODE] Coupon expired January 31 is rejected on February 1",
      "implementation": "src/coupons/rules.py:88 is_valid",
      "assertion": "tests/coupons/test_rules.py:54 asserts result is EXPIRED",
      "observed": "Coupon rejected as EXPIRED",
      "proofs": [{"command": "python -m pytest tests/coupons/test_rules.py::test_rejects_expired_coupon",
                  "exit_code": 0, "tests_run": 1, "tests_failed": 0, "tests_skipped": 0}],
      "verdict": "PASS"
    },
    {
      "id": "C2", "source": "plan.md#Criteria-2",
      "expected": "[CODE] Coupon expiring on the checkout date is accepted",
      "implementation": "src/coupons/rules.py:88 is_valid",
      "assertion": "tests/coupons/test_rules.py:69 asserts result is VALID",
      "observed": "Coupon accepted",
      "proofs": [{"command": "python -m pytest tests/coupons/test_rules.py::test_accepts_coupon_on_expiry_date",
                  "exit_code": 0, "tests_run": 1, "tests_failed": 0, "tests_skipped": 0}],
      "verdict": "PASS"
    }
  ],
  "gates": [
    {"command": "python -m pytest", "cwd": ".", "exit_code": 0,
     "tests_run": 214, "tests_failed": 0, "tests_skipped": 0, "test_required": true}
  ],
  "test_policy": {
    "tautology_check": {
      "verdict": "PASS",
      "evidence": "Reviewed test_rules.py:54 and :69 against all eleven patterns; both pin independent expiry results."
    },
    "dropped_tests": []
  },
  "mutations": [
    {"id": "M1", "location": "src/coupons/rules.py:88",
     "change": "before to after", "tests": "test_rules.py::test_rejects_expired_coupon", "detected": true}
  ],
  "porcelain_unchanged": true,
  "signals": []
}
```

Hash `plan.md` (when the feature has one) and `checks.md` when the reviewer starts.

Every new round requires `test_policy`, including docs-only rounds. Its `tautology_check` object has a `verdict` and nonempty, non-placeholder `evidence`. Completion requires `verdict: PASS` with no `[INFERRED]` evidence. Cite the retained tests and their assertions after applying the [checklist](test-policy.md#tautology-checklist). If no tests are added, changed, or named as proofs, say so in the evidence.

`dropped_tests` is an explicit list, empty when no uncommitted extra candidates were dropped. Each row has a nonempty, non-placeholder `test` identifier and a one-line `reason`. Test identifiers must be unique after trimming whitespace. For example, `{"test": "tests/test_rules.py::test_duplicate_expiry", "reason": "The retained boundary test catches the same fault."}`. This list records discarded candidates, not permission to remove existing tests. Builder fault evidence stays under `checks.md` `## Handoff`. Existing immutable rounds stay unchanged; save a new round to satisfy the current format.

`review_files` lists every file in the review packet as a path relative to the repository root. `review_tokens` is the delegation gate's estimate for exactly those files: their bytes divided by four. The validator recomputes the estimate from `review_files` with the same method and warns when the numbers differ, so an undercount shows. When the gate decides `local`, set `review_type: self` and name the main session as reviewer. Otherwise set `review_type: independent` with reviewers who differ from the author: one for `delegate`, and for `split_required`, one identity per slice, at least the token total divided by the 150,000-token ceiling, rounded up.

Each checkpoint's `proofs` lists every command named for that check in `checks.md`, with its exit code and test counts. Cite implementation and assertion as `path:line` for behavior changes. The completion gate rejects changed obligations, an unlocated assertion, or a missing or failed named proof.

From round 2 on, each checkpoint carries `basis`: `verified at <sha>` when the reviewer re-ran it on that reviewed HEAD, or `carried from <sha>` when the fix left it untouched and the earlier result stands. The validator fails a later-round checkpoint with neither, and a `verified at` SHA that is not a reviewed HEAD.

For `UI: yes`, list all reviewed names on the `Screens:` line, in the plan's Observable section or, for a small change, in `## Intent`. Add one `ui_evidence` row per name with `screen`, `source`, `observed`, `states`, and `verdict: PASS|FAIL|GAP|BLOCKED`. Name the binding source, describe what the reviewer saw, and account for empty, loading, error, and unauthorized states in `states`, including justified `n/a` values. The completion gate requires a passing row for exactly each listed screen.

For a critical mutation path, set `critical_mutation_path: true` and give `critical_mutation_reason`. Each mutation row needs a unique `id`, `path:line` location, `change`, `tests`, and `detected: true` for PASS.

For a docs-only change use `kind: docs`, passing `document_checks` rows with `path`, `command`, `exit_code: 0`, and `verdict: PASS`, plus only applicable mutations. Check verdicts may be PASS, FAIL, GAP, or BLOCKED. Signals use `ac_gap`, `spec_precision_gap`, `spec_deviation`, `surviving_mutant`, or `gate_fail`, with stable `id`, `type`, and the checkpoint, mutation, gate, or loaded lesson link needed by [lessons](lessons.md). The round's `feature_id` (the feature folder name), `project`, and `repository` identify each lesson observation, and the complete stage requires them. [Lessons](lessons.md) chooses the lesson's area scope at ingestion.


## Fingerprint

The fingerprint includes HEAD, binary diff against HEAD, and untracked file contents outside `.specs/`. The validator computes it from the Git root it runs in. A repository with no commit has no HEAD, so commit before review.

## Verification summary

`verification.md` begins with `Round: execution/reviews/round-N.json`, `SHA256: <full hash of saved round>`, `Verdict: PASS|FAIL|BLOCKED`, `Review: independent` or `Review: self-reviewed` matching the round's `review_type`, and the same `UI` as `checks.md`. Summarize check results, gates, coverage gaps, UI evidence if applicable, mutations, and ranked gaps.

## Pause handoff

`execution/handoff.md` gives the last green slice, next slice, latest round and hash, blockers, approvals pending, and the current fingerprint. It points to the plan and diff and copies neither.
