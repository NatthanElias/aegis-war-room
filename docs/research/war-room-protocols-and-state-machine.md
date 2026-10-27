# War room protocols, AI incident response SOTA, and Pi Durable state-machine evidence

**Date:** 2026-10-25
**Scope:** Comparative verification of human incident command protocols, regulated fintech compliance overlays, 2025-2026 AI-native incident response implementations, multiplayer human-agent coordination failure modes, and `@earendil-works/pi-durable@1.4.0` + `@earendil-works/chord@1.4.0` API mechanics.
**Version context and revalidation triggers:** Regulatory citations reflect rules in force as of October 2026 (BACEN Res. BCB nº 85/2021 as amended through Res. BCB nº 538/2025, DORA RTS (EU) 2025/301, PCI-DSS v4.0.1). Package mechanics were verified directly against unpacked `@earendil-works/pi-durable@1.4.0` and `@earendil-works/chord@1.4.0` TypeScript declarations and runtime modules. Revalidate document scopes, hook execution phases, and replay semantics before upgrading either package.

---

## 1. Research questions

1. Which micro-mechanics from FEMA NIMS/ICS, Google IMAG, PagerDuty ICS, ITIL 4 Swarming, and fintech regulatory regimes (BACEN, DORA, PCI-DSS, SOC 2) govern high-severity payment outages?
2. Where do production engineering organizations (Stripe, Ramp, Block, Netflix, Uber, incident.io, Rootly, HolmesGPT) draw the line between AI autonomy and human authority, and what failure modes occur when an LLM joins a live incident?
3. Why does an unstructured group chat with a bot fail during a Sev-1 incident, and how do human roles map onto `@earendil-works/pi-durable` and `@earendil-works/chord` without breaking Command-vs-Keyboard separation?
4. What state-machine schema, Two-Key Break-Glass flow, and post-incident `intent.md` contract fit Stage 6 (`Maintain`) of Anthropic's AI-Native SDLC Playbook?

---

## 2. Human war room protocols and regulated fintech overlays

### 2.1 FEMA NIMS/ICS, Google IMAG, and PagerDuty ICS

**Documented facts:**

- **Span of control (1:5 target, 1:3 to 1:7 range).** FEMA NIMS and Course IS-100.C define a manageable supervisory ratio of three to seven subordinates per lead, with five as the optimum ([FEMA IS-100.C](https://training.fema.gov/is/courseoverview.aspx?code=IS-100.c); [FEMA NIMS](https://www.fema.gov/emergency-managers/nims)).
- **Explicit transfer of command.** Google's Incident Management at Google (IMAG) assigns initial command to the first responder on scene until an explicit live handoff occurs and the incoming Incident Commander (IC) confirms acceptance ([Google SRE Book, Ch. 14: Managing Incidents](https://sre.google/sre-book/managing-incidents/)). Google's Incident State Document records structured current state rather than relying on chat scrollback ([Google SRE Book, Appendix C](https://sre.google/sre-book/incident-document/)).
- **Hands-off-keyboard command separation.** PagerDuty's Incident Commander protocol prohibits the IC from inspecting raw graphs, reading debug logs, or modifying production systems. If the IC is the only responder capable of executing the technical fix, the IC must transfer command before touching production ([PagerDuty Incident Commander Training](https://response.pagerduty.com/training/incident_commander/)). Google IMAG similarly restricts production system changes to the Operations Lead / operations team ([Google SRE Book, Ch. 14](https://sre.google/sre-book/managing-incidents/)).
- **Operational periods and CAN reports.** Adapted from wildland firefighting into IT incident response by Brent Chapman / Blackrock 3 Partners ([USENIX LISA14](https://www.usenix.org/conference/lisa14/conference-program/presentation/chapman)), the IC sets a fixed pulse loop (typically 10-15 minutes for Sev-1) with silent working intervals in between. At each pulse, leads report **Conditions** (current symptoms and blast radius), **Actions** (in-progress checks or mitigations), and **Needs** (approvals, access, or specialist help).

### 2.2 Intelligent Swarming and ITIL 4 Major Incident Management

**Documented facts:**

- **Elimination of L1/L2/L3 handoff queues.** The Consortium for Service Innovation's Intelligent Swarming framework replaces tiered ticket escalation with single ownership and dynamic cross-functional collaboration ([Consortium for Service Innovation](https://www.serviceinnovation.org/intelligent-swarming/)).
- **Cynefin alignment in ITIL 4.** ITIL 4 (*Incident Management* and *Create, Deliver and Support*, with contributions from Jon Stevens-Hall) incorporates swarming for complex and major incidents alongside Incident Command System roles. In complex outages, sequential queue handoffs lose context and add Mean Time to Resolution (MTTR) latency, whereas unmoderated swarming without an IC creates bystander noise and duplicated work.

### 2.3 Regulated fintech compliance overlays

**Documented facts:**

- **DORA (Regulation (EU) 2022/2554 & Commission Delegated Regulation (EU) 2025/301 Art. 5(1)).** Financial entities must submit an initial notification of a major ICT-related incident within **4 hours** of classifying the incident as major and no later than **24 hours** from detection, an intermediate report within **72 hours**, and a final root-cause report within **1 month** ([EUR-Lex 32022R2554](https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2554); [EBA DORA RTS](https://www.eba.europa.eu/regulation-and-policy/operational-resilience-and-dora)).
- **BACEN Resolução BCB nº 85/2021 (as amended by Res. BCB nº 368/2024 and nº 538/2025) & Resolução BCB nº 1/2020 (Pix).** Regulated Brazilian payment and financial institutions must maintain documented crisis-classification criteria (Art. 3º IV, Art. 6º), communicate relevant security or operational crisis events promptly to Banco Central do Brasil and affected users (Art. 20 I-III), and retain incident logs, root-cause analyses, and remediation records for **5 years** (Art. 23 IX) ([BCB Res. 85/2021](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20BCB&numero=85)). Under Pix rules, DICT data exposure requires formal notification regardless of realized financial loss, and *Bloqueio Cautelar* permits preventive fund holds up to **72 hours** ([BCB Res. 1/2020](https://www.bcb.gov.br/estabilidadefinanceira/exibenormativo?tipo=Resolu%C3%A7%C3%A3o%20BCB&numero=1)).
- **PCI-DSS v4.0.1 (Req. 3.3.1, 12.10.1, 12.10.7).** Sensitive Authentication Data (SAD: CVV2/CVC2, PIN blocks, full track data) must never be stored after authorization (Req. 3.3.1). Effective March 31, 2025, Req. 12.10.7 mandates immediate incident response and containment procedures whenever Primary Account Numbers (PANs) appear in unexpected locations such as application logs, debug dumps, or LLM transcripts ([PCI SSC Library](https://www.pcisecuritystandards.org/document_library/)).
- **SOC 2 (CC6.1, CC7.4, CC8.1) & Dual Control (4-Eyes / Maker-Checker).** Emergency production changes require documented justification, segregation of duties (preventing unilateral self-approval), and retrospective change reconciliation ([AICPA Trust Services Criteria](https://www.aicpa-cima.com/resources/download/2017-trust-services-criteria)). Production access systems implement this via explicit dual-authorization thresholds, such as Teleport's `spec.allow.request.thresholds` (`approve: 2`) with self-review blocked, HashiCorp Vault Control Groups (`sys/control-group/authorize`), and GitHub Environment Protection Rules (`Prevent self-review`).

### 2.4 Tactical micro-mechanics: Hypothesis boards and mitigation ladders

**Observed SRE practice:**

- **Three-state hypothesis board (`active` / `ruled_out` / `confirmed`).** Transitioning a hypothesis to `ruled_out` requires attaching concrete disconfirming telemetry or trace references so later responders do not re-run dead-end checks.
- **Ordered mitigation ladder.** Payment engineering teams separate customer harm mitigation from permanent code repair, evaluating interventions in ascending order of risk and latency:
  1. Canary rollback or traffic shift away from a recent deploy (0-5 min)
  2. Feature flag / kill-switch toggle (0-5 min)
  3. Pool drain, replica failover, or PSP/region reroute (5-15 min)
  4. Load shedding / rate-limit tightening / circuit breaking (immediate under saturation)
  5. Forward code hotfix (last resort when rollback is blocked by state or schema changes)

---

## 3. AI-native incident response in industry (2025-2026)

### 3.1 First-party engineering architectures

**Documented facts:**

- **Stripe Minions & Blueprints.** Stripe runs unattended coding agents ("Minions") producing 1,300+ merged PRs per week inside pre-warmed EC2 devboxes that boot in ~10 seconds and remain isolated from production credentials and public internet egress ([Stripe Blog Part 1](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents); [Stripe Blog Part 2](https://stripe.dev/blog/minions-stripes-one-shot-end-to-end-coding-agents-part-2)). Each run follows a **Blueprint**: a code-defined state machine interleaving deterministic nodes (linters, git operations, targeted test selection) with bounded LLM tool loops, drawing from narrow per-blueprint subsets of ~500 MCP tools ("Toolshed") and capping CI repair at 2 rounds.
- **Ramp On-Call Assistant (OCA).** Ramp's Temporal-backed OCA assisted on 575 of 1,220 merged incident PRs over a 4-week window, reducing engineer headcount per incident by 37% and estimated engineer time by ~50% ([Ramp Builders Blog, Sept 9, 2026](https://builders.ramp.com/post/how-we-built-oca-our-ai-on-call-assistant)). Ramp documented two critical safeguards:
  1. **Lookback-window trap rules:** Agents frequently misattributed incident start times because observability tools defaulted to 1-hour windows. OCA prompts require explicit time bounds and pre-incident baseline checks.
  2. **Six one-shot detour hooks:** Before OCA calls its final Slack-posting tool, deterministic hooks intercept the draft and force single-pass checks against read-replica Postgres data, deployment timestamps, reasoning traps, falsified alternatives, formatting rules, and existing runbooks.
- **Block Goose & Operation Pale Fire.** Block's offensive security team red-teamed its MCP-enabled agent (`goose`) in "Operation Pale Fire" (Jan 15, 2026), demonstrating indirect prompt injection hidden inside invisible zero-width and Unicode Tag Block (`U+E0000`-`U+E007F`) characters in untrusted Google Calendar invitations ([Block Engineering](https://block.xyz/)). Block responded with corporate MCP allowlists (`GOOSE_ALLOWLIST`), Unicode tag stripping on tool ingestion, and OS-process telemetry correlation.
- **Netflix, Uber, and commercial/OSS platforms.** Netflix's open-source `dispatch` orchestrates incident rooms and roles (`Active` / `Stable` / `Closed` in [`enums.py`](https://raw.githubusercontent.com/Netflix/dispatch/main/src/dispatch/incident/enums.py)). Uber's Genie (45,000+ monthly queries) and Debug Assist pair RAG and trace correlation with draft PR generation ([Uber Blog](https://www.uber.com/blog/genie-ubers-gen-ai-on-call-copilot/)). Commercial and CNCF tools (`incident.io`, `Rootly`, `PagerDuty Advance`, `HolmesGPT`, `Resolve AI`, `Cleric`) converge on the same boundary: **autonomous execution** covers read-only telemetry queries, deploy diffing, call/chat Scribe synthesis, hypothesis pruning, and sandboxed draft PRs; **human-gated authority** covers severity classification, external/regulatory comms, traffic shifts, rollbacks, circuit breakers, and production deploys.

### 3.2 Documented LLM failure modes in high-stress war rooms

**Documented facts:**

- **Early hypothesis anchoring and belief-updating failures.** Waterloo WISE Lab's evaluation across 48,000 GAIA/OpenRCA cloud incident scenarios (`arXiv:2601.22208`, Jan 2026) and OpenRCA's 1,675-run failure study (`arXiv:2602.09937`, Feb 2026) identify anchoring on initial plausible anomalies and failure to update beliefs after negative evidence as dominant LLM RCA failure modes. Zhou et al. (`arXiv:2601.08045`, Jan 2026) catalog 90 developer-LLM cognitive bias patterns across 15 categories, showing how confident model explanations amplify human confirmation and automation bias.
- **Context rot and interleaved chat collision.** Cognitive Systems Engineering studies of human incident response—Klein et al. (2005) on *Common Ground*, John Allspaw's (2015) Lund University thesis ([LUP 8043383](https://lup.lub.lu.se/student-papers/search/publication/8043383)), and Laura Maguire's (2019/2020) Ohio State dissertation on coordination costs—show that linear chat streams suffer from scrollback blindness and interleaved discourse collision. Adding an unconstrained bot to a multi-party room compounds this with split-brain prompting (contradictory instructions from concurrent engineers) and channel noise amplification.
- **Passive log prompt injection and PAN/PII leakage.** Attackers can plant prompt-injection strings or invisible Unicode tags inside HTTP headers, webhook fields, or Pix memo strings that surface when an SRE agent queries error logs. Simultaneously, raw debug logs risk exposing unmasked PANs or Brazilian CPFs to persistent transcripts.

---

## 4. Verified `@earendil-works/pi-durable@1.4.0` and `@earendil-works/chord@1.4.0` mechanics

Direct inspection of unpacked `@earendil-works/pi-durable@1.4.0` (`README.md`, `dist/documents.d.ts`, `dist/types.d.ts`, `dist/harness/types.d.ts`, `dist/harness/tool.js`) and `@earendil-works/chord@1.4.0` established the following ground-truth API rules:

1. **Single-owner SQLite + Chord RPC variants.** `@earendil-works/pi-durable/storage/sqlite/node` requires a single Node.js owner process. Multiplayer web clients connect via `@earendil-works/chord`, whose `remote(name, { variants })` capability lets the server expose distinct RPC method sets per role (`commander`, `tech_lead`, `sme`, `compliance_observer`).
2. **Document scopes and mandatory `checkpointWhen`.** `defineDoc` supports three scopes:
   - `scope: "session"` (`SessionDocToken<T>`): Singleton shared across the entire Harness session (`root` plus all `fork()` branches).
   - `scope: "conversation"` with either latest-only or `history: "rewindable", fork: "asOf"` (`RewindableConversationDocToken<T>`), enabling `harness.snapshotAsOf(token, conversationId, entryId, context)` for point-in-time audit reconstruction.
   - `scope: "task"` (`TaskDocToken<T>`).
   Every `defineDoc` requires `checkpointWhen(value, ops, info): boolean`, and custom document or entry `kind` strings must not start with `"pi."`.
3. **Busy-conversation submissions and passive writes.**
   - `root.submit({ type: "input", content, whenBusy: "steer" }, context)` queues input into `pi.inbox` and injects it at the **next tool-round boundary**; it does not abort an in-flight async tool mid-execution (`Conversation.abort()` handles hung runs).
   - `submit({ type: "write", entry: { kind, data } }, context)` writes a passive custom entry immediately even while a generation or tool round is running, fitting non-disruptive CAN report submissions.
   - `conversation.fork()` creates an independent branch with a fresh UUIDv7 `pi.provider` session identity, isolating speculative SME diagnostics from `root` until verified findings are explicitly promoted.
4. **Why `beforeTool` must be synchronous/stateless rather than holding an open approval Promise.**
   In `dist/harness/tool.js`, `ToolTask` runs `beforeTool` during `{ phase: "call" }` with a read-only `HookApi` (`DocumentReader`, no `Tx`) *before* committing `{ phase: "execute" }`. Holding an unresolved Promise inside `beforeTool` while waiting minutes for two humans to click Approve is unsafe: a process crash loses the in-memory wait, increments `restarts` toward `settings.restartLimit` (default `5`, transitioning the task to `task_parked`), and cannot durably persist the pending proposal.
   - **Verified crash-safe pattern:** Use a replay-safe `propose_mitigation` tool that calls `api.commit(...)` to write a SHA-256-locked `BreakGlassProposal` into the session document and returns `control: { terminate: true }` to end the model turn cleanly. Human Maker and Checker principals co-sign via Chord RPC, which marks the proposal `"approved"` and triggers execution. Destructive tools **omit `replay: "safe"`** (default at-most-once execution), and `beforeTool` performs an immediate `api.snapshot(...)` check, returning `{ block: "..." }` unless a matching, non-expired `"approved"` proposal exists.
5. **Three-channel `afterTool` redaction.**
   `ToolExecutionResult` exposes `output` (for the model), `structuredOutput` (for `executeTool()` and QuickJS `codemode` callers), and `details` (for UIs). `afterTool` hooks must scrub PANs, CPFs, secrets, and invisible Unicode tag characters across **all three channels** before the `ToolResultEntry` commits to SQLite.
6. **QuickJS `codemode` and `GenerationTask` `onYield`.**
   `@earendil-works/pi-durable/codemode` executes JavaScript inside an in-process QuickJS WebAssembly sandbox with journaled nested-tool replay, keeping raw megabyte log dumps out of LLM context. `hook(GenerationTask, { onYield })` can intercept candidate model answers once (tracked via `api.memo(...)`) to enforce Ramp-style falsification and lookback-window checks before root-cause publication.

---

## 5. Cross-platform incident state machines and SDLC Stage 6 (`intent.md`)

**Documented facts:**

- **State granularity across open-source and SaaS incident tools:**
  - `Netflix/dispatch`: `Active` -> `Stable` -> `Closed` (with regression `Stable` -> `Active`).
  - `incident.io`: Status categories `triage`, `live` (default: *Investigating*, *Fixing*, *Monitoring*), `learning`, `closed`, plus `declined`, `merged`, `paused`, `canceled`. Time spent in `triage` is excluded from active duration metrics, and regressions (such as `Monitoring` -> `Investigating`) are supported.
  - `Rootly`: `in_triage` -> `started` -> `mitigated` -> `resolved` -> `closed` / `cancelled`, with orthogonal `detected_at` and `acknowledged_at` timestamps.
  - `PagerDuty`: `triggered` -> `acknowledged` -> `resolved` (with reopen support).
- **Anthropic AI-Native SDLC Playbook (Stage 6: `Maintain`) and Claude Code hook semantics:**
  - The 6-stage loop (`Plan` -> `Design` -> `Build` -> `Test` -> `Deploy` -> `Maintain`) closes when Stage 6 converts production incidents into permanent regression evaluations and a machine-executable **`intent.md`** consumed by Stage 1 (`Plan`) and Stage 3 (`Build`).
  - Note on Claude Code vs. Pi Durable hook semantics: in Claude Code CLI hooks (`PreToolUse`), exit code `2` (or structured JSON `deny` on exit `0`) hard-blocks a tool call while exit code `1` fails open as a non-blocking hook error. In `@earendil-works/pi-durable@1.4.0`, hard-blocking is expressed by returning `{ block: "reason" }` from `hook(ToolTask, { beforeTool })`.

---

## 6. Contradictions, trade-offs, and open unknowns

1. **Hands-off IC rule vs. lean on-call staffing.** Google IMAG and PagerDuty forbid the IC from debugging, yet in lean teams the first responder is often the domain expert. An AI Scribe + diagnostic agent partially relieves this tension during solo initial triage, provided the UI supports a clean two-step `transferCommand` -> `acceptCommand` handoff as soon as a second human joins.
2. **Mitigate-first speed vs. forensic preservation and 4-Eyes compliance.** Restarting tasks or rolling back immediately halts TPV bleed, whereas PCI-DSS Req. 12.10.7 and SOC 2 CC8.1 require preserving forensic evidence and obtaining dual authorization. Pre-computing the SHA-256 payload hash, blast radius, and rollback plan inside a single War Room co-signing card keeps Maker-Checker latency to seconds rather than minutes.
3. **Open unknowns requiring measurement during implementation:**
   - **Redaction throughput:** Measure regex + Luhn PAN/CPF/Unicode scrubbing latency under realistic QuickJS `codemode` log batch sizes.
   - **SQLite WAL contention:** Verify commit latency when streaming `pi.live` tool progress alongside concurrent SME `submit({ type: "write" })` CAN reports and `WarRoomDoc` deltas.
   - **Prompt-injection completeness:** Stripping Unicode Tag Blocks and known delimiter tokens reduces indirect injection risk, but log text remains untrusted input; structural capability isolation (`beforeTool` Two-Key gates + read-only diagnostic tools) remains the primary security boundary.
