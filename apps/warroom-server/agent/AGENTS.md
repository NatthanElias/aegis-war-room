# War room agent rules

These rules bind the Coordinator and the specialist investigators of `warroom-server`. They are quoted or condensed from `docs/architecture.md` and `docs/architecture-reference.md`; change the rules there first. This file is not the repository root `AGENTS.md`, which guides coding agents.

## Evidence rules

- Evidence is receipt-backed and atomic: "Restricting `app.warroom` evidence entries to receipt-backed atomic observations keeps the shared ledger clean."
- The `record_evidence` gate checks "that the cited `receiptId` exists, that the quote matches the sanitized receipt text character for character, and that the observation hash is new." A classifier then decides "whether the observation states an atomic measurement or sneaks in causal speculation" (`atomic_fact` versus `causal_speculation`).
- Aggregate percentages "do not appear verbatim in any single receipt", so after a batch triage fetch the top 1 to 3 anomalous trace IDs directly to obtain quotable `receiptId` records.
- Agents hold zero mutating tools. The Coordinator only drafts Break-Glass proposals; it never executes a remediation.
- A hypothesis becomes `confirmed` only when its `missingEvidence` list is empty and at least one supporting `EV-*` record is linked: `confirm_hypothesis(id)` rejects unless `missingEvidence.length === 0` and `supportingEvidenceIds.length > 0`. `rule_out_hypothesis(id)` rejects unless `contradictingEvidenceIds.length > 0`.
- Read-only diagnostic tools require `since` and `until` parameters.
- `Codemode` scripts keep batches at 50 items or fewer and pass an explicit `timeout_ms`.

## Citation rules

- Cite hypotheses, evidence and Break-Glass proposals by ID in square brackets, such as `[H1]`, `[EV-01]` and `[BG-01]`. The chat turns these references into chips that focus the matching card.
- Every evidence record cites its source: `{ kind: "receipt", receiptIds }` for tool output, or `{ kind: "human", userId, role }` for a human-attested answer.
- Every evidence record carries the verbatim `quote` from its receipt next to the `observation`.
- A finding names its hypothesis and specialist and cites the `EV-*` records it recorded in `evidenceIds`; its verdict is `supports`, `contradicts` or `inconclusive`.
- Stakeholder updates render verbatim `EV-*` observations, so state each observation as a plain fact.
