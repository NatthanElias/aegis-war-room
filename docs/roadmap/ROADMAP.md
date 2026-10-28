# War room roadmap

Last checkpoint: 2026-10-27. Stories: [STORIES.md](STORIES.md).

Phase 01, new project. Previous phases: None.

## Goal and demo story

During a Sev-1 card-payment outage, responders anchor on the loudest symptom and lose minutes to it. The war room runs AI investigators that may only record receipt-backed evidence, and it lets a remediation run only after two people sign it.

Demo story: Alice, the Incident Commander, and Bob, a Responder, open the war room in two browsers. Bob injects the cascade decoy, which is an 8-second `acquirer-beta` delay that saturates the sandbox's database pool. The Coordinator opens competing hypotheses, and investigators record receipt-backed evidence that disproves the "database saturated" decoy and points at `acquirer-beta`. Midway through, someone runs `kill -9` on `warroom-server`, and the investigation resumes with nothing lost. The Coordinator drafts a Break-Glass action. Bob signs Key 1, and Alice signs Key 2. The sandbox recovers, and the card TPV bleed drops on screen.

## Constraints

- Output language: English.
- Deadline: 2026-12-03, the live defense. The date is fixed, and the cut line moves when time runs short.
- Developers: 1, Natthan.
- Must budget: the Musts do not fit in 60% of the time at the standard pace. The team kept every Must at full size, chose the AI-assisted size mapping, and accepted no slack before the Shoulds.

## Schedule

The chart spreads the scope features over the front in working days, up to the demo on 2026-12-03. Only the milestone dates are fixed. The feature dates are a proposal, and the team revises them at each checkpoint.

```mermaid
%%{init: {
  "theme": "base",
  "themeVariables": {
    "textColor": "#7f7f7f", "titleColor": "#7f7f7f", "taskTextOutsideColor": "#7f7f7f",
    "taskTextColor": "#1f2328", "taskTextLightColor": "#1f2328", "taskTextDarkColor": "#1f2328", "taskTextClickableColor": "#1f2328",
    "taskBkgColor": "#56B4E9", "taskBorderColor": "#0072B2",
    "critBkgColor": "#E69F00", "critBorderColor": "#D55E00",
    "doneTaskBkgColor": "#A0A0A0", "doneTaskBorderColor": "#6E6E6E",
    "activeTaskBkgColor": "#009E73", "activeTaskBorderColor": "#006B4F",
    "todayLineColor": "#D55E00",
    "sectionBkgColor": "#56B4E9", "sectionBkgColor2": "#E69F00", "altSectionBkgColor": "#7f7f7f",
    "excludeBkgColor": "rgba(127, 127, 127, 0.18)", "gridColor": "#7f7f7f"
  },
  "themeCSS": ".grid .tick line{stroke:#7f7f7f;opacity:0.4} text.taskTextOutsideRight,text.taskTextOutsideLeft{fill:#7f7f7f !important} text.taskText{paint-order:stroke;stroke:#56B4E9;stroke-width:4px;stroke-linejoin:round} text.taskText[class*=critText]{stroke:#E69F00} text.taskText[class*=doneText]{stroke:#A0A0A0} text.taskText[class*=activeText]{stroke:#009E73}"
}}%%
gantt
    title War room, phase 01 until 2026-12-03
    dateFormat YYYY-MM-DD
    axisFormat %d/%m
    excludes weekends

    section Milestones
    M0 Walking skeleton                :milestone, m0, 2026-10-28, 0d
    M1 Live incident state             :milestone, m1, 2026-11-04, 0d
    M2 Decoy disproved with evidence   :milestone, m2, 2026-11-13, 0d
    M3 Demo story end to end           :milestone, m3, 2026-11-23, 0d
    M4 Live defense                    :milestone, m4, 2026-12-03, 0d

    section Milestone 0, Natthan
    walking-skeleton US-01             :crit, skel, 2026-10-27, 2d

    section War room, Natthan
    card-auth-sandbox US-02            :crit, sbx, after skel, 2d
    warroom-state US-04                :crit, state, after sbx, 2d
    chaos-cascade-decoy US-03          :crit, decoy, after state, 1d
    coordinator US-07                  :crit, coord, after decoy, 2d
    investigators US-05                :crit, inv, after coord, 3d
    evidence-gate US-06                :crit, gate, after inv, 2d
    warroom-ui US-08                   :crit, ui, after gate, 3d
    break-glass US-09                  :crit, bg, after ui, 2d
    crash-resume US-10                 :crit, crash, after bg, 1d
    webhook-injection US-11            :wh, after crash, 1d
    semantic-guard US-12               :guard, after wh, 1d
    tpv-token-meter US-13              :tpv, after guard, 1d
    e2e-suite EN-01                    :e2e, after tpv, 2d
    chaos-bad-bin US-15                :bin, after e2e, 1d
    rollback-safety US-16              :rbs, after bin, 2d
    remediation-spec US-17             :spec, after rbs, 1d
    stakeholder-update US-18           :upd, after spec, 1d
    batch-triage US-19                 :triage, after upd, 2d
    human-attestation, Could           :att, after triage, 1d
    steer-stop, Could                  :steer, after att, 1d
```

The schedule rests on these assumptions:

- Sizes become working days: S takes 1 day, M takes 2, and L takes 3. This is an AI-assisted pace. At the standard pace of 1, 3, and 5 days, the Musts alone would run past the deadline.
- The chart skips weekends. The team works every weekday, holidays included.
- The extras run in reverse cut order, so the last feature to cut is built first. Under this plan, the work through `chaos-bad-bin` ends on 2026-12-01. Everything from `rollback-safety` on falls on or after the demo day, and it ships only if the Musts finish early.
- No Must waits for a Could, so cutting `steer-stop` frees no Must date. It shortens the tail of the extras.
- One developer means no parallel slack. A one-day slip in any Must moves every later bar by one day.

## Scope

| Priority | Feature | Slug | Size | Stories | Front |
| --- | --- | --- | --- | --- | --- |
| Must | Walking skeleton: compose stack, three PostgreSQL pools and roles, empty services, UI shell, test runner | `walking-skeleton` | M | US-01 | War room |
| Must | Card authorization sandbox with BIN routing, two acquirers, and read-only telemetry | `card-auth-sandbox` | M | US-02 | War room |
| Must | Scenario A, the cascade decoy fault | `chaos-cascade-decoy` | S | US-03 | War room |
| Must | Incident state, phases, roster, and Chord role permissions | `warroom-state` | M | US-04 | War room |
| Must | Four specialist investigators with receipts and sanitization | `investigators` | L | US-05 | War room |
| Must | Evidence gate: receipt and quote checks, causal regex, and Jev Spot A | `evidence-gate` | M | US-06 | War room |
| Must | Coordinator agent with hypothesis tools and the confirmation gates | `coordinator` | M | US-07 | War room |
| Must | Split-screen UI: chat plus the Hypotheses, Evidence, Break-Glass, and Status & Spec tabs | `warroom-ui` | L | US-08 | War room |
| Must | Two-Key Break-Glass with durable idempotent execution | `break-glass` | M | US-09 | War room |
| Must | Crash and resume of `warroom-server` during an investigation | `crash-resume` | S | US-10 | War room |
| Should | Overlay I, webhook prompt injection and PAN leak | `webhook-injection` | S | US-11 | War room |
| Should | Jev Spot C semantic injection guard toggle | `semantic-guard` | S | US-12 | War room |
| Should | Card TPV bleed versus agent token spend meter | `tpv-token-meter` | S | US-13 | War room |
| Should | Deterministic end-to-end suite for the demo scenarios | `e2e-suite` | M | EN-01 | War room |
| Should | Scenario B, the bad BIN config rollout | `chaos-bad-bin` | S | US-15 | War room |
| Should | Rollback Safety check | `rollback-safety` | M | US-16 | War room |
| Should | `REMEDIATION_SPEC.md` export in POSTMORTEM | `remediation-spec` | S | US-17 | War room |
| Should | Stakeholder Update publisher | `stakeholder-update` | S | US-18 | War room |
| Should | Jev Spot B batch triage inside Codemode | `batch-triage` | M | US-19 | War room |
| Could | Steer and Stop controls on running investigators | `steer-stop` | S | - | War room |
| Could | Human-attested answers to `missingEvidence` | `human-attestation` | S | - | War room |
| Won't | Conversation fork for parallel hypotheses | `conversation-fork` | - | - | - |
| Won't | `intent.md` generation | `intent-md` | - | - | - |
| Won't | Real authentication or SSO | `real-auth` | - | - | - |
| Won't | Real acquirer integrations | `real-acquirers` | - | - | - |
| Won't | Cloud deployment | `cloud-deploy` | - | - | - |

Cut order, first to go: `steer-stop`, `human-attestation`, `batch-triage`, `stakeholder-update`, `remediation-spec`, `rollback-safety`, `chaos-bad-bin`, `e2e-suite`, `tpv-token-meter`, `semantic-guard`, `webhook-injection`.

At a phase close, the Priority column keeps the phase's priorities, and each row records whether the feature shipped.

## Milestones

| Milestone | Outcome | Target date | Status |
| --- | --- | --- | --- |
| 0 | Walking skeleton: `docker compose up` starts PostgreSQL, `card-auth-sandbox`, and `warroom-server`. A browser opens the war room shell over a Chord WebSocket, and the build and test commands run. | 2026-10-28 | Not started |
| 1 | Bob injects the cascade decoy and the sandbox pool saturates, while Alice and Bob see the same incident state live in two browsers, each with their own role permissions. | 2026-11-04 | Not started |
| 2 | An alert opens competing hypotheses. Investigators record receipt-backed evidence that disproves the database decoy, and the gate rejects speculative or unquoted evidence. | 2026-11-13 | Not started |
| 3 | The whole demo story runs in the split-screen UI: Two-Key Break-Glass fixes `acquirer-beta`, and a `kill -9` mid-investigation resumes cleanly. | 2026-11-23 | Not started |
| 4 | The demo story at the live defense, with the Shoulds that shipped. | 2026-12-03 | Not started |

## Fronts

### War room

- Owner: Natthan.
- Outcome: the whole demo story, built in sequence.
- Owns: the whole repository.
- Provides: None, because there is no other front to use them.
- Uses: None.
- Depends on: milestone 0.
- Stories: US-01 to US-13, US-15 to US-19, and EN-01. US-14 became EN-01.
- Status: on track. Work starts 2026-10-27.

## Shared files

None. With one front, every file has the same owner. Milestone 0 still creates the shared structure, such as the compose file, the migration layout, the service folders, and the agent `skills/` folder, so that each later feature adds files instead of editing shared ones.

## Contracts

None. Contracts in this roadmap are interfaces between fronts, and there is only one front. The interfaces between `card-auth-sandbox` and `warroom-server` live in [Architecture reference](../architecture-reference.md) and in each feature's plan.

## Risks and assumptions

- The Musts fill 20 of 27 working days at the AI-assisted pace, and need more than all 27 at the standard pace. If milestone 2 slips past 2026-11-13, cut in the agreed order at that checkpoint instead of waiting for the last week.
- `@earendil-works/pi-durable@1.4.0` and `@earendil-works/chord@1.4.0` are new releases. If an API in the architecture does not behave as documented, the walking skeleton finds out first, and the team changes the architecture before milestone 1.
- The live demo reaches both the reasoning model and Jev through one OpenRouter key. Every gate fails closed, so an OpenRouter outage, a rate limit, or an exhausted credit balance during the defense would stall the demo. Top up the credits before 2026-12-03, rehearse with the deterministic test providers, and keep a recorded run as a fallback.
- Model answers vary between runs. If the Coordinator wanders during rehearsals, tighten the `AGENTS.md` rules and the specialist skills before tightening the code.
- The defense machine must run Docker. Check it before 2026-12-03.

## Out of scope

- Conversation fork: one shared bridge is enough for the demo story, and fork adds a second state to explain.
- `intent.md`: `REMEDIATION_SPEC.md` replaces it as the post-incident artifact.
- Real authentication or SSO: three seeded users show the Maker and Checker separation without an identity provider.
- Real acquirer integrations: the sandbox simulates `acquirer-alpha` and `acquirer-beta` so the faults can be reproduced.
- Cloud deployment: the grading asks for a one-command local startup with `docker compose`.

## Decisions

Decisions that cross fronts live in [DECISIONS.md](DECISIONS.md).
