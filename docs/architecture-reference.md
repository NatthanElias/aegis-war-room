# Architecture reference

This document specifies the runtime topology, data schemas, connection pools, classifier contracts, permissions, UI layout, and test invariants for the credit-card war room Proof-of-Concept. For the design rationale behind these specifications, read [War room architecture decisions](file:///home/nate/Projects/eng-soft-class/final-assigment/docs/architecture.md).

## Runtime topology

The system runs two Node.js TypeScript processes and one PostgreSQL 17 container:

| Service | Backing state | Responsibilities |
| :--- | :--- | :--- |
| `postgres` (`postgres:17-alpine`) | Docker volume | Stores `card_holds`, `schema_migrations`, `break_glass_idempotency`, and live lock and session metadata in `pg_stat_activity`. |
| `card-auth-sandbox` | Stateless Node.js HTTP server over PostgreSQL | Runs synthetic card traffic, Visa and Mastercard BIN routing, `acquirer-alpha` and `acquirer-beta` gateway calls, chaos fault flags, read-only telemetry endpoints, and idempotent remediation endpoints. |
| `warroom-server` | `incidents/<incidentId>.db` SQLite file | Sole owner of the `pi-durable` session database. Runs the Coordinator conversation, background investigator tasks, `Codemode` QuickJS sandboxes, `Jev` classifier gates, Chord WebSocket server, and static frontend assets. |

### Open agentic file layout

Repository agent artifacts use vendor-neutral file paths:

- `AGENTS.md`: Root operational rules, epistemic constraints, and citation rules for the Coordinator and investigators.
- `skills/logs/SKILL.md`, `skills/db/SKILL.md`, `skills/deploy/SKILL.md`, and `skills/acquirer/SKILL.md`: Domain investigation playbooks and `Codemode` script templates.
- `REMEDIATION_SPEC.md`: Post-incident engineering specification exported during the `POSTMORTEM` phase.

## PostgreSQL connection pools

`card-auth-sandbox` and `warroom-server` connect to PostgreSQL through three isolated pools, each stamped with a distinct `application_name`:

| Pool name | PostgreSQL role | `max` | Timeouts and session flags | Purpose |
| :--- | :--- | :---: | :--- | :--- |
| `card-auth-sandbox` | `sandbox_app` | `10` | Default pool wait; holds open transactions during acquirer calls | Live Visa and Mastercard authorization holds and settlements. |
| `warroom-diag` | `warroom_diag` with `pg_read_all_stats` | `2` | `connectionTimeoutMillis: 2000`, `statement_timeout = '2s'`, `lock_timeout = '500ms'`, `default_transaction_read_only = on` | Read-only investigator diagnostics (`pg_stat_activity`, `EXPLAIN`, `card_holds` inspection, `schema_migrations` reads). |
| `warroom-admin` | `sandbox_admin` | `2` | `connectionTimeoutMillis: 2000`, `statement_timeout = '5s'` | Idempotent Break-Glass mutations and Rollback Safety Checks. |

## Durable state schemas in `warroom-server`

`warroom-server` persists state in SQLite through two `@earendil-works/pi-durable@1.4.0` document definitions.

### Session singleton: `app.warroom`

Defined with `defineDoc({ kind: "app.warroom", scope: "session" })` and checkpointed every 50 operations:

| Field | Type | Description |
| :--- | :--- | :--- |
| `sev` | `"SEV-1" \| "SEV-2" \| "SEV-3"` | Current incident severity. |
| `phase` | `"DETECT" \| "TRIAGE" \| "MITIGATE" \| "RESOLVE" \| "POSTMORTEM"` | Current phase governed by `TRANSITIONS`. |
| `semanticGuardEnabled` | `boolean` | Controls whether `Jev` Spot C screens external webhook bodies. |
| `hypotheses` | `Record<string, Hypothesis>` | Keyed by `H1`, `H2`, and so on. States: `"active" \| "ruled_out" \| "confirmed"`. Tracks `supportingEvidenceIds`, `contradictingEvidenceIds`, and `missingEvidence` (`{ id, need, askOf? }`). |
| `evidence` | `Record<string, EvidenceEntry>` | Immutable `EV-*` facts containing `observation`, `quote`, `source` (`{ kind: "receipt", receiptIds }` or `{ kind: "human", userId, role }`), and `createdAt`. |
| `rejected` | `RejectedEvidence[]` | Audit log of submissions rejected by the receipt check, causal regex, or `Jev` Spot A (`reason: "missing_receipt" \| "quote_mismatch" \| "causal_speculation" \| "guard_unavailable"`). |
| `proposals` | `Record<string, BreakGlassProposal>` | Drafted, Maker-signed, Checker-approved, and executed Break-Glass records (`BG-*`), including `payloadHash` and `rollbackSafety`. |
| `updates` | `StakeholderUpdate[]` | Published Incident Commander bridge updates. |
| `roster` | `Record<string, SeededUser>` | Seeded identities: `alice` (`IC`), `bob` (`Responder`), and `carol` (`Observer`). |

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
| Toggle `Inject Chaos` and `Semantic Injection Guard` | Allowed | Allowed | Denied |
| Set `sev`, transition `phase`, and publish Stakeholder Updates | Allowed | Denied | Denied |
| Sign Break-Glass Key 1 (`Maker`, commits `sha256(canonicalJSON(action, args))`) | Denied | Allowed | Denied |
| Sign Break-Glass Key 2 (`Checker`, requires `checkerId !== makerId`, hash match, `phase === "MITIGATE"`) | Allowed | Denied | Denied |

## Split-screen UI layout

- **Top bar:** Severity selector, 5-phase stepper, live **Card TPV Bleed ($/min)** vs. **Agent Token Spend ($)** from `harness.usage()`, **Semantic Injection Guard** toggle, seeded user switcher (`Alice`, `Bob`, `Carol`), and **Inject Chaos** menu.
- **Left 50% (War-room chat):** Multiplayer chat stream rendering human messages, Coordinator responses, and `subagent.report` milestones. Regex parser converts `[H1]`, `[EV-01]`, and `[BG-01]` references into clickable chips that focus the target card in the right pane.
- **Right 50% (4-tab workbench):**
  - **Hypotheses:** Active, ruled-out, and confirmed cards, live subagent status, **Investigate**, **Steer**, and **Stop** actions, and `missingEvidence` items with inline human-attestation inputs.
  - **Evidence:** Immutable `EV-*` list with receipt or human-attested badges plus expandable `rejected` gate log.
  - **Break-Glass:** Proposal cards with blast radius, **Rollback Safety** badge, and Two-Key signature controls.
  - **Status & Spec:** Editable Stakeholder Update publisher and `POSTMORTEM` `REMEDIATION_SPEC.md` viewer and download action.

## Chaos scenarios and verification suite

### Fault scenarios

1. **Scenario A (Cascade decoy):** Injects an 8,000 ms delay on `acquirer-beta` inside an open database transaction, saturating `card-auth-sandbox`'s 10-connection pool so database saturation acts as a decoy symptom.
2. **Scenario B (Bad BIN config rollout):** Pushes a faulty Mastercard BIN routing configuration that spikes gateway declines and exercises Rollback Safety and Two-Key rollback.
3. **Overlay I (Webhook prompt injection and PAN leak):** Injects Luhn-valid test PANs (`4111...`), keyed CVVs, invisible Unicode Tags, and plain-English override instructions inside external webhook bodies.

### Automated test invariants

- **Chat test double:** Uses `FauxResponseFactory` from `@earendil-works/pi-ai/providers/faux` keyed on input content rather than a positional response queue so parallel subagent runs and post-crash replays never desynchronize.
- **Classifier test double:** Registers a custom `typesafe` test provider implementing `classify()` keyed on a SHA-256 hash of `context.state` so `getModelOfType("classifier", "typesafe", "jev-latest")` works identically in deterministic tests and production.
- **Required end-to-end assertions:** Scenario A decoy disproof, Scenario B rollback, Overlay I PAN/CVV redaction and Spot C toggle behavior, `confirm_hypothesis` blocked while `missingEvidence` is non-empty, `makerId === checkerId` rejected, and `kill -9` mid-subagent process crash resuming cleanly from `incidents/<incidentId>.db`.
