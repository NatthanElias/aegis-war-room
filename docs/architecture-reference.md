# Architecture reference

This document specifies the runtime topology, data schemas, connection pools, classifier contracts, permissions, UI layout, and test invariants for the credit-card war room Proof-of-Concept. For the design rationale behind these specifications, read [War room architecture decisions](file:///home/nate/Projects/eng-soft-class/final-assigment/docs/architecture.md).

## Runtime topology

The system runs two Node.js TypeScript processes and one PostgreSQL 17 container:

| Service | Backing state | Responsibilities |
| :--- | :--- | :--- |
| `postgres` (`postgres:17-alpine`) | Docker volume | Stores `card_holds`, `schema_migrations`, `break_glass_idempotency`, and live lock and session metadata in `pg_stat_activity`. |
| `card-auth-sandbox` | Stateless Node.js HTTP server over PostgreSQL | Runs synthetic card traffic, Visa and Mastercard BIN routing, `acquirer-alpha` and `acquirer-beta` gateway calls, scenario-based chaos faults set through a loopback-only control listener, read-only telemetry endpoints, and idempotent remediation endpoints. |
| `warroom-server` | `incidents/<incidentId>.db` SQLite file | Sole owner of the `pi-durable` session database. Runs the Coordinator conversation, background investigator tasks, `Codemode` QuickJS sandboxes, `Jev` classifier gates, Chord WebSocket server, and static frontend assets. |

### Open agentic file layout

Repository agent artifacts use vendor-neutral file paths:

- `apps/warroom-server/agent/AGENTS.md`: Operational rules, epistemic constraints, and citation rules for the Coordinator and investigators, under the headings `Evidence rules` and `Citation rules`. It lives in the `warroom-server` folder because the repository root `AGENTS.md` is the workspace guide for coding agents.
- `apps/warroom-server/agent/skills/logs/SKILL.md`, `apps/warroom-server/agent/skills/db/SKILL.md`, `apps/warroom-server/agent/skills/deploy/SKILL.md`, and `apps/warroom-server/agent/skills/acquirer/SKILL.md`: Domain investigation playbooks and `Codemode` script templates, one folder per `SPECIALISTS` row. Each `SKILL.md` starts with frontmatter whose `name` is the folder name.
- `REMEDIATION_SPEC.md`: Post-incident engineering specification exported during the `POSTMORTEM` phase.

## PostgreSQL connection pools

`card-auth-sandbox` and `warroom-server` connect to PostgreSQL through three isolated pools, each stamped with a distinct `application_name`:

| Pool name | PostgreSQL role | `max` | Timeouts and session flags | Purpose |
| :--- | :--- | :---: | :--- | :--- |
| `card-auth-sandbox` | `sandbox_app` | `10` | Default pool wait; holds open transactions during acquirer calls | Live Visa and Mastercard authorization holds and settlements. |
| `warroom-diag` | `warroom_diag` with `pg_read_all_stats` | `2` | `connectionTimeoutMillis: 2000`, `statement_timeout = '2s'`, `lock_timeout = '500ms'`, `default_transaction_read_only = on` | Read-only investigator diagnostics (`pg_stat_activity`, `EXPLAIN`, `card_holds` inspection, `schema_migrations` reads). |
| `warroom-admin` | `sandbox_admin` | `2` | `connectionTimeoutMillis: 2000`, `statement_timeout = '5s'` | Idempotent Break-Glass mutations and Rollback Safety Checks. |

## Sandbox card holds and telemetry

`card-auth-sandbox` authorizes synthetic Visa and Mastercard traffic. A card number whose first digit is `4` is Visa and goes to `acquirer-alpha`. A number starting `51` to `55`, or `2221` to `2720`, is Mastercard and goes to `acquirer-beta`. Any other number is refused as `unsupported_bin` before any database or acquirer work. Each acquirer is an in-process simulation that answers after a base latency (`acquirer-alpha` 80 ms, `acquirer-beta` 120 ms) plus up to 40 ms of jitter plus a fault delay that defaults to 0. An amount whose cents end in `51` is declined; every other amount is approved.

### `card_holds` table

Migration `0002_card_holds.sql` creates one row per committed authorization. The full card number is never stored.

| Column | Type | Description |
| :--- | :--- | :--- |
| `id` | `bigserial` | Primary key. |
| `trace_id` | `uuid`, unique | The ID that telemetry and later receipts quote. |
| `brand` | `text` | `visa` or `mastercard`. |
| `acquirer` | `text` | `acquirer-alpha` or `acquirer-beta`. |
| `bin` | `char(6)` | First 6 digits of the card number. |
| `last4` | `char(4)` | Last 4 digits of the card number. |
| `amount_cents` | `integer` | Positive amount in US cents. |
| `status` | `text` | `PENDING`, `APPROVED`, `DECLINED`, or `ERROR`. |
| `created_at` | `timestamptz` | Start of the authorization's transaction. |
| `decided_at` | `timestamptz` | Null until the acquirer answers. |

An authorization runs `BEGIN`, inserts the `PENDING` row, calls the acquirer, updates the status, and runs `COMMIT`, all on one `sandbox_app` pool connection. While the acquirer call is in progress the row is uncommitted: `pg_stat_activity` shows a `card-auth-sandbox` session `idle in transaction`, and a plain `SELECT` as `warroom_diag` does not see the row. If the acquirer or the status update fails, the transaction rolls back, so an `ERROR` authorization leaves no row and shows only in telemetry.

Grants: `sandbox_app` has `SELECT, INSERT, UPDATE` on `card_holds` and `USAGE` on its sequence, `warroom_diag` has `SELECT`, and `sandbox_admin` has `SELECT, UPDATE`. No runtime role can `DELETE` or `TRUNCATE`.

### Synthetic traffic

The sandbox generates its own traffic when `TRAFFIC_RATE` is set to a whole number of authorizations per second (compose sets 5; unset or 0 generates none). Each tick authorizes a Luhn-valid test card number built from the BINs `411111`, `424242`, `555555`, `510510`, and `222300`, with an amount from 500 to 20,000 cents. While 50 authorizations are in flight the generator skips a tick and adds it to `dropped`.

### Telemetry routes

The routes are read-only, unauthenticated, and reachable only on the compose network. They answer from an in-process window of the last 300 seconds and at most 10,000 authorizations, and from the app pool's live counters. They never query PostgreSQL, so they keep answering when the app pool is saturated. The window resets when the sandbox restarts. The response shapes are TypeBox schemas in `packages/contracts/src/sandbox-telemetry.ts`.

| Route | Query | Response |
| :--- | :--- | :--- |
| `GET /telemetry/acquirers` | `windowSec`, a whole number from 1 to 300, default 60 | `SandboxAcquirerTelemetry`: per acquirer, `approved`, `declined`, `errors`, `inFlight`, `oldestInFlightMs`, and `latencyMs` `{p50, p95, max}`, counting authorizations started in the window; plus `dropped`. A bad `windowSec` answers `400` `{"error":"invalid_window"}`. |
| `GET /telemetry/authorizations` | `since` and `until` (required, ISO 8601 date, or date-time with `Z` or an offset, at most 3600 s apart), `acquirer`, `limit` (1 to 500, default 100) | `SandboxAuthorizationList`, newest first, with `traceId`, `bin`, `last4`, `status`, and `latencyMs`. Errors answer `400` with `invalid_range`, `invalid_acquirer`, or `invalid_limit`. |
| `GET /telemetry/pool` | none | `SandboxPoolTelemetry`: `{max: 10, total, idle, waiting}`. |

An authorization that began before the window is left out of the counts even while it is still in flight, so a stuck call older than `windowSec` needs a wider window to appear. `latencyMs` covers authorizations that reached a final status, and is `null` when none did. A slow acquirer shows in the fault delay that tests set in process (`setAcquirerDelay`) or that the presenter sets through the chaos control listener (see Fault scenarios). The public port has no route for it.

## Durable state schemas in `warroom-server`

`warroom-server` persists state in SQLite through two `@earendil-works/pi-durable@1.4.0` document definitions.

### Session singleton: `app.warroom`

Defined with `defineDoc({ kind: "app.warroom", version: 2, scope: "session", initial, migrate, checkpointWhen })` in `apps/warroom-server/src/incident-store.ts`. `checkpointWhen` stores a complete base once 49 deltas follow the newest base, which gives "checkpointed every 50 operations". A new incident starts at `SEV-1` and `DETECT` with the seeded roster and empty `hypotheses` and `evidence` records.

The document is at version 2. Version 2 holds `sev`, `phase`, `roster`, `hypotheses`, and `evidence`. The `migrate` function reads a stored version 1 value, keeps its `sev`, `phase`, and `roster`, and adds the two empty records, so an incident file written before version 2 opens unchanged in meaning. A version 2 file cannot be read by version 1 code. The other rows of the table are added by the features that need them, each with a version bump and a `migrate` function.

The `Hypothesis`, `Evidence`, `InvestigationRequest`, and `InvestigationFinding` shapes are TypeBox schemas in `packages/contracts/src/investigation.ts`, with the `SPECIALISTS` table (`logs`, `db`, `deploy`, `acquirer`).


| Field | Type | Description |
| :--- | :--- | :--- |
| `sev` | `"SEV-1" \| "SEV-2" \| "SEV-3"` | Current incident severity. |
| `phase` | `"DETECT" \| "TRIAGE" \| "MITIGATE" \| "RESOLVE" \| "POSTMORTEM"` | Current phase governed by `PHASE_TRANSITIONS` in `packages/contracts/src/incident.ts`. |
| `semanticGuardEnabled` | `boolean` | Controls whether `Jev` Spot C screens external webhook bodies. |
| `hypotheses` | `Record<string, Hypothesis>` | Keyed by `H1`, `H2`, and so on (version 2). States: `"active" \| "ruled_out" \| "confirmed"`. Tracks `title`, `supportingEvidenceIds`, `contradictingEvidenceIds`, `missingEvidence` (`{ id, need, askOf? }`), and `createdAt`. |
| `evidence` | `Record<string, EvidenceEntry>` | Keyed by `EV-01`, `EV-02`, and so on (version 2). Immutable `EV-*` facts containing `hypothesisId`, `observation`, `quote`, `source` (`{ kind: "receipt", receiptIds }` or `{ kind: "human", userId, role }`), and `createdAt`. |
| `rejected` | `RejectedEvidence[]` | Audit log of submissions rejected by the receipt check, causal regex, or `Jev` Spot A (`reason: "missing_receipt" \| "quote_mismatch" \| "causal_speculation" \| "guard_unavailable"`). |
| `proposals` | `Record<string, BreakGlassProposal>` | Drafted, Maker-signed, Checker-approved, and executed Break-Glass records (`BG-*`), including `payloadHash` and `rollbackSafety`. |
| `updates` | `StakeholderUpdate[]` | Published Incident Commander bridge updates. |
| `roster` | `Record<string, SeededUser>` | Seeded identities: `alice` (`IC`), `bob` (`Responder`), and `carol` (`Observer`). |

### Chord objects for the incident

The server writes `app.warroom` only through `harness.commit`. One host-lifetime watch (`watchDoc`) mirrors each committed revision into the local object `warroom.incident-mirror`, so a browser never sees a value that is not yet stored.

Browsers hold the remote type `warroom.incident` v1 over the same `/chord` socket as `warroom.shell` v1. Its state is `sev`, `phase`, and `roster`; browsers do not yet receive `hypotheses` or `evidence`. Its methods are `setPhase({ phase })` and `setSev({ sev })`. Each method asserts the caller's role from the Chord principal and rejects with `forbidden` unless the caller is the `IC`. `setPhase` checks the transition table inside the same commit and rejects with `invalid` for a move the table does not allow. The factory refuses the server's own principal with `forbidden`.

### Phase transition table

Allowed `setPhase` transitions:

- `DETECT` -> `TRIAGE`
- `TRIAGE` -> `MITIGATE`
- `MITIGATE` -> `RESOLVE`, `TRIAGE`
- `RESOLVE` -> `POSTMORTEM`, `MITIGATE`
- `POSTMORTEM` -> terminal

### Session document family: `app.receipt`

Defined with `defineDocFamily({ kind: "app.receipt", scope: "session" })` keyed by `receiptId` (`api.callId`):

- Written via idempotent upsert inside the shared diagnostic fetch helper before returning tool output.
- Stores `{ receiptId, tool, normalizedArgsHash, conversationId, sanitizedText }` capped at 8 KB via `@earendil-works/chord/output` `boundOutput`.
- Keeps raw payloads out of `app.warroom` WebSocket state deltas while remaining verifiable after `Codemode` nested task cleanup.

## Agent, tool, and classifier contracts

### Agent definitions

1. **Coordinator (`root` conversation).** Configured with System 2 reasoning model, zero mutating tools, `draft_break_glass`, `create_hypothesis`, `investigate`, `confirm_hypothesis`, `rule_out_hypothesis`, `section("verified_incident_evidence")`, and `section("recent_bridge_chat")`.
2. **Specialist Investigator (1 background task definition + 4-row `SPECIALISTS` table).** Rows: `logs`, `db`, `deploy`, and `acquirer`. Maximum 4 concurrent live children enforced inside `investigate` commit. Configured with row-specific read-only tools (requiring `since` and `until` parameters), `createCodemodeExtension` (`max` batch size <= 50 items, explicit `timeout_ms`), `record_evidence`, `report_finding`, and `section("verified_incident_evidence")`.

The Coordinator and the investigators meet only at the `warroom.investigation` task (version 1), defined in `apps/warroom-server/src/agents/investigation-task.ts`. Its input is an `InvestigationRequest` (`hypothesisId`, `specialist`, `question`, `since`, `until`) and its result is an `InvestigationFinding` (`hypothesisId`, `specialist`, `verdict`, `summary`, `evidenceIds`). `launchInvestigation(tx, request)` rejects a request that fails the schema with `invalid_investigation_request` before it creates anything, and otherwise creates the task as a background task and returns its task ID. The Coordinator reads the outcome through `pi-durable` and never imports the investigators.

`createAgentRegistry()` in `apps/warroom-server/src/agents/index.ts` is the one registration point. It installs the extensions `warroom.coordinator` and `warroom.investigators`, in that order; `startServer` takes an optional `agents` option to replace the registry or the models. Until the investigators feature lands, the stub `warroom.investigators` extension finishes every investigation at once with an `inconclusive` finding, and tests replace it with `fakeInvestigators(script)` from `test-support/fake-investigators.ts`.

### Tool caller boundaries

To prevent `Codemode` scripts from invoking governance or state-transition tools in loops:

- Tools restricted with `callers: ["model"]`: `record_evidence`, `report_finding`, `draft_break_glass`, `create_hypothesis`, `confirm_hypothesis`, and `rule_out_hypothesis`.
- `beforeTool` defense-in-depth hook blocks any tool name in `MUTATING_TOOLS` across both direct model calls and nested script calls.

### TypeSafe `Jev` (`typesafe/jev-latest`) classifier slots

All `models.classify()` calls check `result.stopReason === "stop"` before reading `result.answers` and fail closed on `"error"` or `"aborted"`:

| Slot | Call site | Rubric type | Contract and failure handling |
| :--- | :--- | :--- | :--- |
| **Spot A: Evidence gate** | `record_evidence` tool (`api.memo()` wrapped) | `choice`: `atomic_fact` vs. `causal_speculation` | Runs after receipt existence, verbatim substring quote match, and causal regex checks pass. Requires `confidence >= 0.70`. Duplicate retries after a crash return the existing `EV-*` ID idempotently. |
| **Spot B: Batch triage** | Investigator `Codemode` scripts | `choice` + `score` over <= 50 items | Groups log or webhook failures and ranks anomalies. Scripts include a 3-line `ok(res)` guard for `stopReason === "stop"`. Investigators must fetch top anomalous trace IDs directly afterward to obtain quotable `receiptId` entries. |
| **Spot C: Semantic injection guard** | Shared diagnostic fetch helper when `semanticGuardEnabled === true` | `choice`: `benign_telemetry` vs. `instruction_injection_attempt` | Screens external webhook bodies before `Codemode` or System 2 context sees them. Quarantines payloads classified as `instruction_injection_attempt` or when `stopReason !== "stop"`. |

## Deterministic safety and epistemic gates

1. **`sanitize(text)` pipeline.** Runs on every diagnostic fetch response (prior to `app.receipt` upsert) and on every human chat submission:
   - Masks 13 to 19 digit Luhn-valid card PANs to `•••• <last4>`.
   - Masks 3 to 4 digit CVV values only when paired with `cvv`, `cvc`, `cvv2`, `cid`, or `security_code` keys.
   - Strips Unicode Tags (`U+E0000` through `U+E007F`), zero-width characters (`U+200B` through `U+200F`, `U+2060`, `U+FEFF`), and bidirectional control characters (`U+202A` through `U+202E`, `U+2066` through `U+2069`).
   - Wraps external webhook bodies in `<untrusted_webhook>...</untrusted_webhook>` with inner closing tags escaped.
2. **Hypothesis confirmation gate.** `confirm_hypothesis(id)` rejects unless `missingEvidence.length === 0` and `supportingEvidenceIds.length > 0`. `rule_out_hypothesis(id)` rejects unless `contradictingEvidenceIds.length > 0`.
3. **`rollbackSafety()` check.** Queries `warroom-admin` pool to verify three conditions:
   - Target deployment contains no irreversible skipped migrations in `schema_migrations` (`down_sql IS NULL` or destructive DDL matching `DROP TABLE`, `DROP COLUMN`, or un-defaulted `SET NOT NULL`).
   - Target `wireVersion` is compatible with the running schema.
   - Both committed `card_holds` with `status = 'PENDING'` and uncommitted `pg_stat_activity` sessions (`application_name = 'card-auth-sandbox'` and `state = 'idle in transaction'`) equal `0` (otherwise marked `"draining / unsafe"`).
4. **Stakeholder Update template.** Renders `sev`, `phase`, live TPV bleed (`$/min`), verbatim `EV-*` observations, active Break-Glass state, and next update timestamp without an LLM call.
5. **Hybrid `REMEDIATION_SPEC.md`.** Unlocked only in `POSTMORTEM`. Renders Timeline, `EV-*` Ledger, Hypothesis Outcomes, and Break-Glass Audit Trail deterministically, plus one System 2 `models.complete()` call for the *Root-Cause Fix and Regression Tests* section.

## Seeded roles and Chord WebSocket permissions

Clients connect via `acceptWebSockets(wss, host, { principal })`, which `@earendil-works/chord` exports from its package root, over a `ws` `WebSocketServer` that serves the `/chord` upgrade path. The server resolves the principal from the `user` query parameter (`alice`, `bob`, or `carol`) and refuses any other value by closing the socket before any state is sent. Switching users in the top bar reconnects the WebSocket under the selected seeded user. `makerId` and `checkerId` always resolve from the authenticated Chord principal, never from client request bodies, backed by explicit server-side role assertions:

| Action | `alice` (`IC`) | `bob` (`Responder`) | `carol` (`Observer`) |
| :--- | :---: | :---: | :---: |
| Read chat, hypotheses, evidence, Break-Glass, and spec tabs | Allowed | Allowed | Allowed |
| Post human chat (`submit({ type: "write" })`) and `@coordinator` prompts | Allowed | Allowed | Denied |
| Create hypotheses and run `Investigate`, `Steer`, or `Stop` | Allowed | Allowed | Denied |
| Submit human-attested answers to `missingEvidence` (`askOf`) | Allowed | Allowed | Denied |
| Toggle `Semantic Injection Guard` | Allowed | Allowed | Denied |
| Set `sev`, transition `phase`, and publish Stakeholder Updates | Allowed | Denied | Denied |
| Sign Break-Glass Key 1 (`Maker`, commits `sha256(canonicalJSON(action, args))`) | Denied | Allowed | Denied |
| Sign Break-Glass Key 2 (`Checker`, requires `checkerId !== makerId`, hash match, `phase === "MITIGATE"`) | Allowed | Denied | Denied |

## Split-screen UI layout

- **Top bar:** Severity selector, 5-phase stepper, live **Card TPV Bleed ($/min)** vs. **Agent Token Spend ($)** from `harness.usage()`, **Semantic Injection Guard** toggle, and seeded user switcher (`Alice`, `Bob`, `Carol`). The top bar has no chaos control: the presenter starts faults from a terminal (see Fault scenarios).
- **Left 50% (War-room chat):** Multiplayer chat stream rendering human messages, Coordinator responses, and `subagent.report` milestones. Regex parser converts `[H1]`, `[EV-01]`, and `[BG-01]` references into clickable chips that focus the target card in the right pane.
- **Right 50% (4-tab workbench):**
  - **Hypotheses:** Active, ruled-out, and confirmed cards, live subagent status, **Investigate**, **Steer**, and **Stop** actions, and `missingEvidence` items with inline human-attestation inputs.
  - **Evidence:** Immutable `EV-*` list with receipt or human-attested badges plus expandable `rejected` gate log.
  - **Break-Glass:** Proposal cards with blast radius, **Rollback Safety** badge, and Two-Key signature controls.
  - **Status & Spec:** Editable Stakeholder Update publisher and `POSTMORTEM` `REMEDIATION_SPEC.md` viewer and download action.

## Chaos scenarios and verification suite

### Fault scenarios

1. **Scenario A (Cascade decoy):** Injects an 8,000 ms delay on `acquirer-beta` inside an open database transaction, saturating `card-auth-sandbox`'s 10-connection pool so database saturation acts as a decoy symptom. The presenter starts it with `npm run chaos -- cascade-decoy`, ends it with `npm run chaos -- clear`, and reads it with `npm run chaos -- status`.
2. **Scenario B (Bad BIN config rollout):** Pushes a faulty Mastercard BIN routing configuration that spikes gateway declines and exercises Rollback Safety and Two-Key rollback.
3. **Overlay I (Webhook prompt injection and PAN leak):** Injects Luhn-valid test PANs (`4111...`), keyed CVVs, invisible Unicode Tags, and plain-English override instructions inside external webhook bodies.

### Chaos control

Chaos belongs to the presenter, not to the war room team (D-08). The sandbox starts a second HTTP listener only when `CHAOS_PORT` is set (compose sets `4001`), bound to `127.0.0.1` and not published to the host. The root script `npm run chaos` runs `apps/card-auth-sandbox/src/chaos-cli.ts` inside the sandbox container with `docker compose exec`, which reaches that loopback port. `warroom-server` cannot reach it, and no contract, Chord object, agent tool, or screen carries chaos state.

| Route on the control listener | Body | Answer |
| :--- | :--- | :--- |
| `PUT /chaos/scenario` | `{"scenario":"cascade-decoy"}` or `{"scenario":"none"}` | `200` with the scenario now set; `400` `{"error":"invalid_scenario"}` for any other body. |
| `GET /chaos/scenario` | none | `200` with the current scenario. |

Any other method or path answers `404`. The scenario lives in the sandbox process and starts at `none`, so restarting the sandbox ends the fault. `cascade-decoy` sets the `acquirer-beta` delay to 8,000 ms for calls that start afterwards, and `none` sets it back to 0; calls already waiting keep their delay. While the pool is saturated the sandbox `/healthz` answers `503`, because its ping waits for a pool connection, so the war room shell shows the sandbox `down`.

### Automated test invariants

- **Chat test double:** Uses `FauxResponseFactory` from `@earendil-works/pi-ai/providers/faux` keyed on input content rather than a positional response queue so parallel subagent runs and post-crash replays never desynchronize.
- **Classifier test double:** Registers a custom `typesafe` test provider implementing `classify()` keyed on a SHA-256 hash of `context.state` so `getModelOfType("classifier", "typesafe", "jev-latest")` works identically in deterministic tests and production.
- **Required end-to-end assertions:** Scenario A decoy disproof, Scenario B rollback, Overlay I PAN/CVV redaction and Spot C toggle behavior, `confirm_hypothesis` blocked while `missingEvidence` is non-empty, `makerId === checkerId` rejected, and `kill -9` mid-subagent process crash resuming cleanly from `incidents/<incidentId>.db`.
