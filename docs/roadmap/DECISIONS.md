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
- D-06 🟢 **[CHOICE]** IN THE CONTEXT OF *holidays before the deadline*, WE CHOSE *to work every weekday, holidays included* TO ACHIEVE *28 working days until the defense*.
- D-07 🟢 **[CHOICE]** IN THE CONTEXT OF *keeping the PoC local and reproducible*, WE CHOSE *to leave out conversation fork, intent.md, real authentication, real acquirers, and cloud deployment* TO ACHIEVE *a one-command startup with docker compose*.

### 2026-10-27

chaos-cascade-decoy plan, agreed by Natthan:

- D-08 🟢 **[CHOICE]** IN THE CONTEXT OF *starting the demo's outages*, WE CHOSE *a presenter command, `npm run chaos`, with no chaos menu in the war room* TO ACHIEVE *an incident the war room finds only from its symptoms*, ACCEPTING *that the presenter needs a terminal next to the browsers*.

### 2026-10-28

Checkpoint after milestone 1, agreed by Natthan:

- D-09 🟢 **[CHOICE]** IN THE CONTEXT OF *two large agent Musts that touch the same server*, WE CHOSE *to build coordinator and investigators at the same time in two Git worktrees, after an agent-seam groundwork that fixes their contract and file ownership* TO ACHIEVE *about two working days back*, ACCEPTING *that one developer reviews two builds at once and that a seam change stops both*.
- D-10 🔵 **[REQUIRED]** IN THE CONTEXT OF *a war room that is judged as a finished product*, WE CHOSE *to build every screen to a production-grade UI and UX bar, with designed empty, loading, error, and unauthorized states* TO ACHIEVE *an app that looks and behaves like an expensive product*, ACCEPTING *more time for every UI feature*.
- D-11 🟡 **[CHANGED]** IN THE CONTEXT OF *finishing about 7 planned days of features in 2 calendar days*, WE CHOSE *a pace of 1 day for S, 1 for M, and 2 for L* TO ACHIEVE *a schedule that matches the measured pace with half of it held in reserve*, ACCEPTING *that a slower stretch eats the reserve first* (replaces D-05).
- D-12 🟢 **[CHOICE]** IN THE CONTEXT OF *choosing the agents' models*, WE CHOSE *to call every model through OpenRouter, with `anthropic/claude-haiku-5.5` for all agents until the final models are picked* TO ACHIEVE *one account and model changes without code changes*, ACCEPTING *weaker reasoning until the final models are chosen*.
- D-13 🔵 **[REQUIRED]** IN THE CONTEXT OF *how an incident reaches the war room*, WE CHOSE *to accept alerts only through an authenticated webhook that the company's monitoring platform calls, and to add a monitoring console to the demo that plays that platform* TO ACHIEVE *the integration Datadog, Grafana, Dynatrace, and PagerDuty already support*, ACCEPTING *a new Must, `monitoring-console`, before the agents*.
- D-14 🟢 **[CHOICE]** IN THE CONTEXT OF *a UI Must too large for one feature at the production bar*, WE CHOSE *to split it into `warroom-ui` for the design system, layout, top bar, and chat, and `warroom-tabs` for the four tabs* TO ACHIEVE *time to finish each screen properly*.
- D-15 🟢 **[CHOICE]** IN THE CONTEXT OF *a demo story that still had Bob injecting the fault*, WE CHOSE *to open it with the presenter's terminal command, the monitoring console, and its alert waking the Coordinator* TO ACHIEVE *a demo story that matches D-08 and D-13*.

## Replaced

### 2026-10-27

Phase 01 kickoff, agreed by Natthan:

- D-05 🟢 **[CHOICE]** IN THE CONTEXT OF *turning sizes into working days*, WE CHOSE *an AI-assisted pace of 1 day for S, 2 for M, and 3 for L* TO ACHIEVE *a schedule where the Musts end on 2026-11-23*, ACCEPTING *that the standard pace would overrun the deadline* (replaced by D-11).
