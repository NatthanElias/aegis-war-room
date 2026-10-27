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

- D-01 🟢 **[CHOICE]** In the context of *the roadmap documents*, we chose *to write them in English* to achieve *one language with the requests and the architecture docs*.
- D-02 🟢 **[CHOICE]** In the context of *a full architecture that needs about 40 days of Musts in 28 days*, we chose *the cascade decoy demo story as the Must set, with Overlay I, Scenario B, Rollback Safety, and the spec export as Shoulds* to achieve *a demo that works end to end by the deadline*, accepting *that governance extras may be cut*.
- D-03 🟢 **[CHOICE]** In the context of *Musts that exceed 60% of the time budget*, we chose *to keep every Must at full size, with four specialists, all four UI tabs, and the causal regex check* to achieve *the complete demo story*, accepting *no slack before the Shoulds*.
- D-04 🟢 **[CHOICE]** In the context of *falling behind schedule*, we chose *to cut steer-stop, human-attestation, batch-triage, stakeholder-update, remediation-spec, rollback-safety, chaos-bad-bin, e2e-suite, tpv-token-meter, semantic-guard, and webhook-injection, in that order* to achieve *governance features that survive longest*.
- D-05 🟢 **[CHOICE]** In the context of *turning sizes into working days*, we chose *an AI-assisted pace of 1 day for S, 2 for M, and 3 for L* to achieve *a schedule where the Musts end on 2026-11-23*, accepting *that the standard pace would overrun the deadline*.
- D-06 🟢 **[CHOICE]** In the context of *holidays before the deadline*, we chose *to work every weekday, holidays included* to achieve *28 working days until the defense*.
- D-07 🟢 **[CHOICE]** In the context of *keeping the PoC local and reproducible*, we chose *to leave out conversation fork, intent.md, real authentication, real acquirers, and cloud deployment* to achieve *a one-command startup with docker compose*.

## Replaced

None yet.
