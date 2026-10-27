# Workspace guide

<!-- setup:brief -->
Proof-of-concept AI-native incident war room for a credit-card payment pipeline (AI-Native SDLC Stage 6: Maintain).
warroom-server runs pi-durable agents and serves multiplayer state over Chord WebSockets; card-auth-sandbox simulates card authorization over PostgreSQL 17 with reproducible chaos faults.
Agents investigate with receipt-backed evidence and hold no mutating tools; every remediation needs Two-Key Break-Glass approval.
Master's final practical project, defended live on 2026-12-03; one-command startup via docker compose.
<!-- /setup:brief -->

## Repositories

<!-- setup:repositories -->
Repositories: single.

| Repository | Role | Start reading |
| --- | --- | --- |
| warroom | War room PoC: warroom-server, card-auth-sandbox, and PostgreSQL | `docs/` |
<!-- /setup:repositories -->

## Task routes

<!-- setup:routes -->
| To | Start at |
| --- | --- |
| Change design rationale | `docs/architecture.md` |
| Change schemas, pools, roles, or tool contracts | `docs/architecture-reference.md` |
| Look up protocol or Jev background | `docs/research/` |
<!-- /setup:routes -->

## Checks

<!-- setup:checks -->
- warroom: `npm run test; npm run typecheck; npm run lint; npm run smoke`
<!-- /setup:checks -->

## Team rules

<!-- setup:team -->
- Project ID for lessons and review rounds: warroom.
- Commits: Local commits under an approved plan; push, force-push, deploy, and production data need explicit approval.
- Delegation: Helpers allowed; parallel writes allowed on disjoint files. Load the `orchestrate` skill before dispatch, research, or a review of code, configuration, dependency, build, or test changes.
- Feature documents: `.specs/features/<feature>/`.
- Constraints: before changing code, run feature-workflow's `constraints.py list` for the areas and paths you touch, and conform to each record or ask to supersede it. `docs/roadmap/DECISIONS.md` is for people, never a coding constraint.

| Document | Path |
| --- | --- |
| Architecture decisions | `docs/architecture.md` |
| Architecture reference | `docs/architecture-reference.md` |

Keep personal choices in `.local/`. Ask before push, publication, deployment, or production data changes.
<!-- /setup:team -->

Work on the user's current checkout. Never switch branches or revisions or create a branch, including through subagents, unless the user asks for it.

## Team additions

<!-- Setup rewrites only the marked parts above and keeps this section. Add one-line team rules here. -->
- Entry file: AGENTS.md is the only always-on file; Claude Code loads it because no CLAUDE.md exists. Do not create CLAUDE.md.
- Question tool: keep each question within 40 words and its options short. Put the background in chat before calling the tool, because the tool crops long text.
- Skill sync: reinstall the project skills from the skills repository's per-harness `project/` collection, then rerun workflow-setup. List each local edit to an installed skill file here as `- Override <skill>/<file>: <reason>.`
