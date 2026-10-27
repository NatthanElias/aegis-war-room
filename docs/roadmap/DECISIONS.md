# War room decisions

Roadmap: [ROADMAP.md](ROADMAP.md). Each line records one decision that changes something the roadmap records. Filter by tag, for example with `grep "\[BANNED\]" DECISIONS.md`.

| Tag | Meaning |
| --- | --- |
| 🟢 `[CHOICE]` | A voluntary decision between two or more viable alternatives. |
| 🔴 `[BANNED]` | A practice, library, or architecture the team bans because of risk. |
| 🔵 `[REQUIRED]` | Something mandatory by design, compliance, security, or core architecture. |
| 🟡 `[CHANGED]` | A decision that replaces an older one. |

## Active

### 2026-10-27

Phase 01 kickoff, agreed by Natthan:

- D-01 🟢 **[CHOICE]** IN THE CONTEXT OF *the roadmap documents*, WE CHOSE *to write them in English* TO ACHIEVE *one language with the requests and the architecture docs*.
- D-02 🟢 **[CHOICE]** IN THE CONTEXT OF *a full architecture that needs about 40 days of Musts in 28 days*, WE CHOSE *the cascade decoy demo story as the Must set, with Overlay I, Scenario B, Rollback Safety, and the spec export as Shoulds* TO ACHIEVE *a demo that works end to end by the deadline*, ACCEPTING *that governance extras may be cut*.
- D-03 🟢 **[CHOICE]** IN THE CONTEXT OF *Musts that exceed 60% of the time budget*, WE CHOSE *to keep every Must at full size, with four specialists, all four UI tabs, and the causal regex check* TO ACHIEVE *the complete demo story*, ACCEPTING *no slack before the Shoulds*.
- D-04 🟢 **[CHOICE]** IN THE CONTEXT OF *falling behind schedule*, WE CHOSE *to cut steer-stop, human-attestation, batch-triage, stakeholder-update, remediation-spec, rollback-safety, chaos-bad-bin, e2e-suite, tpv-token-meter, semantic-guard, and webhook-injection, in that order* TO ACHIEVE *governance features that survive longest*.
- D-05 🟢 **[CHOICE]** IN THE CONTEXT OF *turning sizes into working days*, WE CHOSE *an AI-assisted pace of 1 day for S, 2 for M, and 3 for L* TO ACHIEVE *a schedule where the Musts end on 2026-11-23*, ACCEPTING *that the standard pace would overrun the deadline*.
- D-06 🟢 **[CHOICE]** IN THE CONTEXT OF *holidays before the deadline*, WE CHOSE *to work every weekday, holidays included* TO ACHIEVE *28 working days until the defense*.
- D-07 🟢 **[CHOICE]** IN THE CONTEXT OF *keeping the PoC local and reproducible*, WE CHOSE *to leave out conversation fork, intent.md, real authentication, real acquirers, and cloud deployment* TO ACHIEVE *a one-command startup with docker compose*.

## Replaced

None yet.
