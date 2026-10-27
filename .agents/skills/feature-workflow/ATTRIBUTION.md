# Attribution

Parts of this skill adapt **tlc-spec-lean** version 1.1.0 by Tech Leads Club (github.com/tech-leads-club), licensed under [CC-BY-4.0](https://creativecommons.org/licenses/by/4.0/). tlc-spec-lean derives from tlc-spec-driven 3.3.0 (Felipe Rodrigues), tlc-plan, and tlc-implement.

## What was taken

| Here | From tlc-spec-lean | Change |
| --- | --- | --- |
| `scripts/check_commit.py` | `scripts/check_commit.py` | None. Agents run it before each commit; no Git hook is installed. |
| `scripts/validate_execution.py`, plan and checks stages | `scripts/validate_plan.py`, `scripts/validate_checks.py` | Merged into one script with this package's complete stage. Every lean rule is kept and lean warnings stay warnings, including a missing Sources section, no numbered criteria, template Assumptions rows, and a Coverage set with no size. Added: a `Lands in:` line per criterion, exact Coverage member counts, specific proofs, a `Criteria:` line per check, repository identities, the UI flag against `Screens:`, a small-change `## Intent`, and unittest dotted selectors. The Profile line is retired and only warns. Plan headings come from `references/plan.md`. |
| `scripts/validate_execution.py`, complete stage | `scripts/validate_verification.py` | Replaced by this package's JSON round, Git fingerprints, review sizing recomputed from `review_files`, and `verified at` / `carried from` basis markers. |
| `scripts/selftest.py`, `scripts/fixtures/` | `scripts/selftest.py`, `scripts/fixtures/` | Rewritten for this package's formats and the three stages. The billing worked example is kept, with EARS `Lands in:` lines, this package's checks, a JSON round, and a scratch Git repository. Profile controls are replaced by review-routing and small-change controls. |
| `scripts/lessons.py` | `scripts/lessons.py` | This package's report-verified store, changed to one file per lesson under `.specs/lessons/` with a regenerated `LESSONS.md`. Schema 3 stores only the sentence, the area scope, and the feature and signal type of each sighting; the round file keeps the evidence. The lesson scope is an area chosen at ingestion, not the round's scope. `migrate` strips an earlier store and `rescope` moves a lesson to an area. Lean's thresholds are kept: two features promote, two penalties quarantine, 45 days prune. |
| `references/plan.md` | `references/plan.md` | Condensed: writing order, the problem without a solution, two questions per turn with a recommendation, "One run must settle it", "A guarantee that something will not happen needs a mechanism", never borrowing another line's number, what is not a one-way door, document and collection surfaces, open bets to an ADR or spike, append-only approved rows, and the closure gate as a `Lands in:` line. Left out: `single module - <name>`, P1/P2 tags, and the per-slice `Independent test` line. |
| `references/memory.md` | `references/memory.md` | Lean's single shared decisions table is replaced by one record file per constraint, owned by `references/constraints.md` and checked by `scripts/constraints.py`. Kept: the admission test, recording at decision time, reading constraints before checks, and conform or supersede. Added: the roadmap's `DECISIONS.md` is for people and never a coding constraint, a `team D-NN` origin links a record to the team decision behind it, and a change the roadmap records blocks until the team agrees. Handoff, resuming, and lessons point to this package's per-feature `execution/handoff.md`, Resume section, and `lessons.md`, so nothing committed holds a handoff. |
| `references/implement.md` | `references/build.md` | "Extra tests beyond the proofs are welcome and there is no quota" and commit authority. Left out: the same-commit `checks.md` progress update, because feature folders are git-ignored. Between the size floor and ceiling a dispatched builder subagent builds, not the current session. A wrong check stops the build and the agent asks. |
| `SKILL.md` | `SKILL.md`, `references/checks.md` | The "never invent" rule, the degraded path, and the output-language rule, copied word for word. Left out: the "Do NOT use for" list. |
| `references/execution-files.md`, `references/verify.md` | `references/checks.md`, `references/verify.md` | One mode at lean's `standard` level replaces the Light, Standard, and Rigorous depths. Below the delegation gate's review floor the main session reviews its own work, says `self-reviewed`, and still injects faults. |

## Ideas from harness-toolkit

The constraint records credit ideas only from **harness-toolkit** by Tech Leads Club (github.com/tech-leads-club), licensed under the Elastic License 2.0. No text or code was copied.

| Here | Idea from harness-toolkit |
| --- | --- |
| `references/constraints.md`, `scripts/constraints.py` | One file per record, four fixed headings, citing a record by link, and a gate that checks each record's shape. |
