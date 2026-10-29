# The Coordinator and the investigators meet only at the warroom.investigation task and the investigation.ts schemas

- **origin**: feature alert-intake
- **scope**: warroom-server, contracts
- **paths**: apps/warroom-server/src/agents/**, apps/warroom-server/src/alerts/**, apps/warroom-server/src/models.ts, apps/warroom-server/src/incident-store.ts, apps/warroom-server/src/server.ts, apps/warroom-server/src/main.ts, packages/contracts/src/investigation.ts, packages/contracts/src/alert.ts, test-support/fake-investigators.ts
- **date**: 2026-10-29
- **replaces**: agent-seam-ownership

## Decision

The Coordinator and the investigators meet only through the `warroom.investigation` task (name, version, input and result) and the schemas in `packages/contracts/src/investigation.ts`. The Coordinator never imports `agents/investigators.ts`. Each receives the server's dependencies as `AgentDeps` (`diagPool`, `sandboxUrl`, `agentModels`) through the factories `createCoordinatorExtension(deps)` and `createInvestigatorsExtension(deps)`.

The `coordinator` feature owns the content of `createCoordinatorExtension` in `agents/coordinator.ts` and `apps/warroom-server/agent/AGENTS.md`. The `investigators` feature owns the content of `createInvestigatorsExtension` in `agents/investigators.ts`, the task body in `agents/investigation-task.ts`, `apps/warroom-server/agent/skills/**` and `test/investigation-task.test.ts`.

Neither feature edits the seam files: `agents/index.ts`, `alerts/**`, `models.ts`, `incident-store.ts`, `server.ts`, `main.ts`, `investigation.ts`, `alert.ts` or `test-support/fake-investigators.ts`. A change to one of them needs agreement from both features, so the build stops for a joint decision.

## Why

The two features are built at the same time in separate worktrees. Parallel edits to one shared file are what the worktrees exist to prevent, and a merge would then settle the contract by accident. The alert path, the model setup and the dependency hand-over touch both agents, so they belong to the seam and not to either build. A durable task also survives a crash mid-investigation, where a direct function call from the `investigate` tool would be lost.

## Trade-offs

A small change to a seam file costs a conversation between the two features instead of a quick edit.

## Not decided here

How the Coordinator answers an alert, and how the real investigator task body runs its tools.
