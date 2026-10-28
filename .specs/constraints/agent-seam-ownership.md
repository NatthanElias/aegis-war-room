# The Coordinator and the investigators meet only at the warroom.investigation task and the investigation.ts schemas

- **origin**: feature agent-seam
- **scope**: warroom-server, contracts
- **paths**: apps/warroom-server/src/agents/**, apps/warroom-server/src/incident-store.ts, apps/warroom-server/src/server.ts, apps/warroom-server/src/main.ts, packages/contracts/src/investigation.ts, test-support/fake-investigators.ts
- **date**: 2026-10-28

## Decision

The Coordinator and the investigators meet only through the `warroom.investigation` task (name, version, input and result) and the schemas in `packages/contracts/src/investigation.ts`. The Coordinator never imports `agents/investigators.ts`. The `coordinator` feature owns `agents/coordinator.ts` and `apps/warroom-server/agent/AGENTS.md`. The `investigators` feature owns `agents/investigators.ts`, the task body in `agents/investigation-task.ts`, `apps/warroom-server/agent/skills/**` and `test/investigation-task.test.ts`. Neither edits `investigation.ts`, `agents/index.ts`, `incident-store.ts`, `server.ts`, `main.ts` or `test-support/fake-investigators.ts`; a change to any of them needs agreement from both features, so the build stops for a joint decision.

## Why

The two features are built at the same time in separate worktrees. Parallel edits to one shared file are what the worktrees exist to prevent, and a merge would then settle the contract by accident. A durable task also survives a crash mid-investigation, where a direct function call from the `investigate` tool would be lost.

## Trade-offs

A small change to a seam file costs a conversation between the two features instead of a quick edit.

## Not decided here

Which model provider the Coordinator uses, and how the real investigator task body runs its tools.
