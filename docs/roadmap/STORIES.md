# War room stories

Roadmap: [ROADMAP.md](ROADMAP.md).

## User stories

### US-01 Start the whole stack with one command

Front: War room. Priority: Must. Feature: `walking-skeleton`.

As a presenter, I want one command to start PostgreSQL, the sandbox, and the war room server, so that I can run the defense on any fresh machine.

```gherkin
Scenario: Fresh start
  Given a clean checkout with Docker installed
  When the presenter runs docker compose up
  Then PostgreSQL, card-auth-sandbox, and warroom-server report healthy
  And a browser opens the war room shell connected over a Chord WebSocket

Scenario: Database not ready
  Given PostgreSQL is still starting
  When card-auth-sandbox and warroom-server start
  Then they wait for the database instead of exiting
```

### US-02 Simulate card authorization traffic

Front: War room. Priority: Must. Feature: `card-auth-sandbox`.

As a presenter, I want the sandbox to authorize synthetic Visa and Mastercard traffic through two acquirers, so that the war room has a live payment pipeline to investigate.

```gherkin
Scenario: Healthy traffic
  Given the sandbox is running with no faults
  When synthetic traffic flows
  Then authorizations route by BIN to acquirer-alpha or acquirer-beta
  And the read-only telemetry endpoints report approvals and latency

Scenario: Acquirer slow to answer
  Given acquirer-beta answers slowly
  When authorizations route to it
  Then the telemetry endpoints show the latency rise on acquirer-beta only
```

### US-03 Inject the cascade decoy

Front: War room. Priority: Must. Feature: `chaos-cascade-decoy`.

As the presenter, I want to start Scenario A with a terminal command, so that the audience sees a database pool saturation that is only a symptom, and the war room finds the cause from its symptoms.

```gherkin
Scenario: Decoy fault
  Given healthy traffic
  When the presenter runs `npm run chaos -- cascade-decoy`
  Then acquirer-beta calls take 8 seconds inside open transactions
  And the sandbox application pool reaches 10 of 10 connections

Scenario: War room cannot reach chaos
  Given the compose stack is running
  When warroom-server connects to the chaos port of card-auth-sandbox
  Then the connection is refused
```

### US-04 Share one incident state across responders

Front: War room. Priority: Must. Feature: `warroom-state`.

As an Incident Commander, I want every participant to see the same incident state live, with actions limited by role, so that the bridge has one source of truth.

```gherkin
Scenario: Live state in two browsers
  Given Alice and Bob are connected
  When Alice moves the phase from TRIAGE to MITIGATE
  Then both browsers show MITIGATE without a reload

Scenario: Role denies a phase change
  Given Bob is signed in as Responder
  When Bob tries to change the phase
  Then the server rejects the change and the phase stays the same
```

### US-05 Investigate with receipt-backed tools

Front: War room. Priority: Must. Feature: `investigators`.

As an Incident Commander, I want specialist investigators for logs, database, deployments, and acquirers to gather sanitized tool output as receipts, so that every finding can be traced to what a tool returned.

```gherkin
Scenario: Database investigator reads live sessions
  Given the cascade decoy is active
  When the Coordinator dispatches the db investigator
  Then it queries pg_stat_activity through the read-only diagnostic pool
  And the sanitized output is stored as a receipt

Scenario: Application pool exhausted
  Given the application pool is saturated
  When the db investigator queries the database
  Then the query runs on the diagnostic pool and is not blocked
```

### US-06 Accept only atomic, quoted evidence

Front: War room. Priority: Must. Feature: `evidence-gate`.

As a Responder, I want the shared ledger to accept only observations that quote a real receipt and state no cause, so that early guesses do not harden into false facts.

```gherkin
Scenario: Valid evidence
  Given a receipt that contains the quoted text
  When an investigator records an atomic observation citing it
  Then a new EV entry appears in the Evidence tab

Scenario: Speculation rejected
  Given an observation that claims a cause
  When an investigator records it
  Then the gate rejects it as causal speculation
  And the rejection appears in the rejected log
```

### US-07 Run competing hypotheses

Front: War room. Priority: Must. Feature: `coordinator`.

As an Incident Commander, I want the Coordinator to open competing hypotheses and dispatch investigators, so that the team weighs more than the loudest symptom.

```gherkin
Scenario: Alert opens hypotheses
  Given the cascade decoy is active
  When the alert reaches the war room
  Then the Coordinator opens at least two hypotheses and dispatches investigators

Scenario: Confirmation blocked
  Given a hypothesis with open missing evidence
  When anyone tries to confirm it
  Then the confirmation is rejected
```

### US-08 Work the incident in a split-screen UI

Front: War room. Priority: Must. Feature: `warroom-ui`.

As a responder, I want a finished split-screen war room with the bridge chat on the left and the incident's top bar always in view, so that I can follow the bridge and act on it in one screen that behaves like a product I trust.

```gherkin
Scenario: Reference chips
  Given the Coordinator posts a message that cites EV-01
  When Alice clicks the EV-01 chip
  Then the right pane opens with EV-01 in focus

Scenario: Switch user
  Given Alice is signed in
  When she switches to Carol in the top bar
  Then the connection reopens as Carol and the controls Carol may not use are disabled

Scenario: Connection lost
  Given Bob is following the bridge
  When the connection to warroom-server drops
  Then the screen says it is reconnecting and keeps the last state readable instead of going blank
```

### US-09 Approve a remediation with two keys

Front: War room. Priority: Must. Feature: `break-glass`.

As an Incident Commander, I want a remediation to run only after a Responder and I both sign the same action, so that no agent or single person can change production.

```gherkin
Scenario: Two keys run the fix once
  Given the Coordinator drafted a Break-Glass proposal and the phase is MITIGATE
  When Bob signs Key 1 and Alice signs Key 2
  Then the sandbox applies the action exactly once and traffic recovers

Scenario: Same person signs both keys
  Given Bob signed Key 1
  When Bob tries to sign Key 2
  Then the signature is rejected
```

### US-10 Survive a war room crash

Front: War room. Priority: Must. Feature: `crash-resume`.

As a presenter, I want the war room server to resume after a hard crash, so that the audience sees that the incident record survives outages.

```gherkin
Scenario: Kill during an investigation
  Given investigators are running
  When the presenter runs kill -9 on warroom-server and restarts it
  Then the transcript, evidence, and approvals are intact
  And the investigation continues
```

### US-11 Contain a poisoned webhook

Front: War room. Priority: Should. Feature: `webhook-injection`.

As a security reviewer, I want card numbers, CVVs, and hidden Unicode stripped from webhook bodies before any model reads them, so that the war room leaks no card data and resists hidden instructions.

```gherkin
Scenario: PAN and CVV masked
  Given Overlay I is injected
  When an investigator fetches the webhook bodies
  Then card numbers appear as the last four digits and keyed CVVs are masked

Scenario: Hidden Unicode stripped
  Given a webhook body with invisible Unicode tag characters
  When it is fetched
  Then the characters are removed before the receipt is stored
```

### US-12 Screen webhooks for prompt injection

Front: War room. Priority: Should. Feature: `semantic-guard`.

As a Responder, I want to toggle a semantic guard that quarantines webhook bodies containing instructions, so that the audience can compare it with regex-only sanitization live.

```gherkin
Scenario: Guard on
  Given the Semantic Injection Guard is on and Overlay I is active
  When an investigator fetches a webhook with plain-English override instructions
  Then the body is quarantined before any model sees it

Scenario: Classifier unavailable
  Given the guard is on
  When the classifier returns an error
  Then the body is quarantined
```

### US-13 Compare outage cost with agent cost

Front: War room. Priority: Should. Feature: `tpv-token-meter`.

As an Incident Commander, I want the top bar to show card TPV bleed per minute next to agent token spend, so that I can see the agents cost less than the outage.

```gherkin
Scenario: Live meter
  Given the cascade decoy is active and investigators are running
  When Alice looks at the top bar
  Then she sees TPV bleed in dollars per minute and token spend in dollars, both updating
```

### US-15 Inject a bad BIN configuration

Front: War room. Priority: Should. Feature: `chaos-bad-bin`.

As the presenter, I want to start Scenario B with the same chaos command as Scenario A, so that the audience sees a rollback-shaped incident next to the decoy.

```gherkin
Scenario: Faulty rollout
  Given healthy traffic
  When the presenter starts Scenario B with `npm run chaos`
  Then Mastercard authorizations route wrongly and gateway declines spike
```

### US-16 Check that a rollback is safe

Front: War room. Priority: Should. Feature: `rollback-safety`.

As an Incident Commander, I want each rollback proposal to show whether it is safe, so that I never approve a rollback that loses data or in-flight holds.

```gherkin
Scenario: Safe rollback
  Given no irreversible migrations and no pending holds
  When the Coordinator drafts a rollback
  Then the proposal shows a safe Rollback Safety badge

Scenario: Holds still in flight
  Given sessions idle in transaction on the sandbox
  When the Coordinator drafts a rollback
  Then the badge shows draining and unsafe
```

### US-17 Export the remediation spec

Front: War room. Priority: Should. Feature: `remediation-spec`.

As an engineer after the incident, I want a `REMEDIATION_SPEC.md` with the timeline, evidence, hypothesis outcomes, and Break-Glass audit trail, so that the fix goes back into planning.

```gherkin
Scenario: Export in POSTMORTEM
  Given the incident is in POSTMORTEM
  When Alice opens the Status & Spec tab
  Then she can download REMEDIATION_SPEC.md

Scenario: Too early
  Given the incident is in MITIGATE
  When Alice opens the Status & Spec tab
  Then the export is locked
```

### US-18 Publish a stakeholder update

Front: War room. Priority: Should. Feature: `stakeholder-update`.

As an Incident Commander, I want to publish a templated stakeholder update without waiting for a model, so that stakeholders get facts on time.

```gherkin
Scenario: Publish
  Given verified evidence exists
  When Alice publishes an update
  Then it shows severity, phase, TPV bleed, quoted evidence, Break-Glass state, and the next update time

Scenario: Responder tries to publish
  Given Bob is signed in
  When Bob tries to publish an update
  Then the server rejects it
```

### US-19 Triage failures in batches

Front: War room. Priority: Should. Feature: `batch-triage`.

As an Incident Commander, I want up to 50 failed authorizations classified in one Codemode script, so that I see category counts and the top anomalous traces instead of raw records, at a fraction of the token cost.

```gherkin
Scenario: Batch classified
  Given 50 failed authorizations
  When the logs investigator runs a triage script
  Then it returns category counts and the top anomalous trace IDs

Scenario: Classifier stops early
  Given the classifier returns an error for the batch
  When the script checks the result
  Then it reports the failure instead of counts
```

### US-20 Wake the war room from our monitoring platform

Front: War room. Priority: Must. Feature: `alert-intake`.

As the company's platform engineer, I want to point our monitoring platform's alert webhook at the war room, so that an alert starts the investigation without anyone typing.

```gherkin
Scenario: Alert wakes the war room
  Given the monitoring platform holds the war room's webhook token
  When it sends an alert for a saturated database pool
  Then the war room accepts it and the Coordinator starts on that alert

Scenario: Repeated alert
  Given the war room already accepted an alert
  When the monitoring platform sends the same alert again
  Then the war room accepts it without starting a second investigation

Scenario: Unknown sender
  Given a request without the webhook token
  When it reaches the webhook
  Then the war room rejects it and starts nothing
```

### US-21 Watch the payment pipeline in Grafana

Front: War room. Priority: Must. Feature: `monitoring-stack`.

As the company's on-call engineer, I want a Grafana dashboard that shows card authorizations, pool use, and acquirer latency, with an alert rule wired to the war room, so that I see the outage start and know the war room was called.

```gherkin
Scenario: Healthy pipeline
  Given healthy traffic
  When the on-call engineer opens the payments dashboard
  Then recent authorizations appear with their brand, acquirer, latency, and result, and the charts stay in their normal range

Scenario: Alert fires
  Given the presenter has started the cascade decoy
  When requests wait on the sandbox pool longer than the alert rule allows
  Then the rule turns to firing and the war room accepts the alert

Scenario: War room unreachable
  Given the war room is down
  When the alert rule fires
  Then Grafana shows the failed notification, and the alert reaches the war room once it is back
```

### US-22 Review hypotheses, evidence, and approvals in tabs

Front: War room. Priority: Must. Feature: `warroom-tabs`.

As a responder, I want the Hypotheses, Evidence, Break-Glass, and Status & Spec tabs beside the chat, so that I can weigh each hypothesis against its evidence and sign an action without leaving the war room.

```gherkin
Scenario: Hypothesis with its evidence
  Given H1 cites EV-01 as contradicting
  When Alice opens H1 in the Hypotheses tab
  Then she sees EV-01 with its quote and receipt, and H1 marked by its status

Scenario: Empty ledger
  Given no evidence has been recorded yet
  When Bob opens the Evidence tab
  Then it explains that investigators have not recorded evidence yet, instead of showing an empty table

Scenario: Observer cannot sign
  Given Carol is signed in as Observer
  When she opens the Break-Glass tab
  Then the signing controls are disabled and say why
```

## Enablers

### EN-01 Replay the demo scenarios deterministically

Front: War room. Priority: Should. Feature: `e2e-suite`. Enables: US-03, US-07, US-09, US-10. Formerly US-14.

An automated end-to-end suite that runs the demo scenarios with deterministic model and classifier doubles, so that a change cannot silently break the decoy disproof, the Two-Key checks, or the crash resume.

```gherkin
Scenario: Suite passes
  Given the deterministic chat and classifier providers
  When the developer runs the end-to-end suite
  Then the decoy disproof, the Two-Key checks, and the crash resume all pass

Scenario: Regression caught
  Given a change that lets one user sign both keys
  When the suite runs
  Then it fails on the Maker and Checker check
```

### EN-02 Fix the contract between the Coordinator and the investigators

Front: War room. Priority: Must. Feature: `agent-seam`. Enables: US-05, US-07.

The shared shapes, the one investigation task, agent registration, and incident document version 2 land on `main` first, so that `coordinator` and `investigators` can be built at the same time without editing the same files.

```gherkin
Scenario: Builds stay apart
  Given the seam is on main
  When coordinator and investigators are built in two worktrees
  Then neither edits a file the other owns

Scenario: Off-contract finding
  Given an investigator returns a finding outside the contract
  When the task completes
  Then the task fails instead of handing the Coordinator the finding
```
