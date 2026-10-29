import { fileURLToPath } from "node:url";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { Harness, MemoryStorage, type Registry } from "@earendil-works/pi-durable";
import type { InvestigationFinding, InvestigationRequest } from "@warroom/contracts";
import pg from "pg";
import { afterEach, describe, expect, test, vi } from "vitest";
import { testAgentDeps } from "../../../test-support/agent-deps.ts";
import { createTestDatabase } from "../../../test-support/database.ts";
import { fakeInvestigators } from "../../../test-support/fake-investigators.ts";
import { makeTempIncidents } from "../../../test-support/incident-server.ts";
import { runMigrations } from "../../card-auth-sandbox/src/migrations.ts";
import { createCoordinatorExtension } from "../src/agents/coordinator.ts";
import { createAgentRegistry, launchInvestigation } from "../src/agents/index.ts";
import { createInvestigatorsExtension } from "../src/agents/investigators.ts";
import { createDiagPool } from "../src/diag-pool.ts";
import { startServer } from "../src/server.ts";

const migrationsDir = fileURLToPath(new URL("../../card-auth-sandbox/migrations", import.meta.url));

// Why: wrapping the factories and the pool factory records what the server hands them without changing what they do.
vi.mock("../src/agents/coordinator.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/agents/coordinator.ts")>();
  return { ...original, createCoordinatorExtension: vi.fn(original.createCoordinatorExtension) };
});
vi.mock("../src/agents/investigators.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/agents/investigators.ts")>();
  return {
    ...original,
    createInvestigatorsExtension: vi.fn(original.createInvestigatorsExtension),
  };
});
vi.mock("../src/diag-pool.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/diag-pool.ts")>();
  return { ...original, createDiagPool: vi.fn(original.createDiagPool) };
});

// Why: the server does not expose its Harness, so this spy keeps the one it opens and the test reads the
// root conversation's resolved agent from it.
const opened: Array<Awaited<ReturnType<typeof Harness.open>>> = [];
vi.mock("@earendil-works/pi-durable", async (importOriginal) => {
  const original = await importOriginal<typeof import("@earendil-works/pi-durable")>();
  return {
    ...original,
    Harness: {
      ...original.Harness,
      open: vi.fn(async (...args: Parameters<typeof original.Harness.open>) => {
        const harness = await original.Harness.open(...args);
        opened.push(harness);
        return harness;
      }),
    },
  };
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  opened.length = 0;
  vi.mocked(createCoordinatorExtension).mockClear();
  vi.mocked(createInvestigatorsExtension).mockClear();
  vi.mocked(createDiagPool).mockClear();
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function openHarness(registry: Registry) {
  const harness = await Harness.open(
    new MemoryStorage(),
    { models: createModels(), registry },
    BACKGROUND_CONTEXT,
  );
  cleanups.push(() => harness.close(BACKGROUND_CONTEXT));
  return { harness, root: await harness.root(BACKGROUND_CONTEXT) };
}

const request = (overrides: Partial<InvestigationRequest>): InvestigationRequest => ({
  hypothesisId: "H1",
  specialist: "db",
  question: "What does the evidence say?",
  since: "2026-10-28T11:00:00Z",
  until: "2026-10-28T12:00:00Z",
  ...overrides,
});

describe("agent registry", () => {
  test("server installs both agents", async () => {
    const incidents = await makeTempIncidents();
    cleanups.push(incidents.remove);
    const server = await startServer(incidents.serverOptions());
    cleanups.push(() => server.close());

    expect(opened).toHaveLength(1);
    const harness = opened[0] as (typeof opened)[number];
    const agent = await (await harness.root(BACKGROUND_CONTEXT)).agent(BACKGROUND_CONTEXT);

    const names = agent.extensions.map((extension) => extension.name);
    expect(names.filter((name) => name.startsWith("warroom."))).toEqual([
      "warroom.coordinator",
      "warroom.investigators",
    ]);
  });

  test("factories receive dependencies", async () => {
    const db = await createTestDatabase();
    cleanups.push(() => db.drop());
    const admin = new pg.Client({ connectionString: db.url });
    await admin.connect();
    try {
      await runMigrations(admin, migrationsDir);
    } finally {
      await admin.end();
    }
    const incidents = await makeTempIncidents();
    cleanups.push(incidents.remove);

    const server = await startServer({
      ...incidents.serverOptions(),
      databaseUrl: db.roleUrl("warroom_diag"),
      sandboxUrl: "http://sandbox.test:3001",
    });
    cleanups.push(() => server.close());

    expect(vi.mocked(createCoordinatorExtension)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createInvestigatorsExtension)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(createDiagPool)).toHaveBeenCalledTimes(1);
    const pool = vi.mocked(createDiagPool).mock.results[0]?.value;
    expect(pool).toBeDefined();
    const received = [
      vi.mocked(createCoordinatorExtension).mock.calls[0]?.[0],
      vi.mocked(createInvestigatorsExtension).mock.calls[0]?.[0],
    ];
    expect(received).toHaveLength(2);
    for (const deps of received) {
      expect(deps?.diagPool).toBe(pool);
      expect(deps?.sandboxUrl).toBe("http://sandbox.test:3001");
      expect(Object.keys(deps?.agentModels ?? {}).sort()).toEqual([
        "acquirer",
        "coordinator",
        "db",
        "deploy",
        "logs",
      ]);
    }
    const harness = opened[0] as (typeof opened)[number];
    const agent = await (await harness.root(BACKGROUND_CONTEXT)).agent(BACKGROUND_CONTEXT);
    expect(
      agent.extensions
        .map((extension) => extension.name)
        .filter((name) => name.startsWith("warroom.")),
    ).toEqual(["warroom.coordinator", "warroom.investigators"]);
  });

  test("fake replaces the stub", async () => {
    const script = (r: InvestigationRequest): InvestigationFinding =>
      r.specialist === "acquirer"
        ? {
            hypothesisId: r.hypothesisId,
            specialist: "acquirer",
            verdict: "supports",
            summary: "acquirer-beta p95 is 8,012 ms",
            evidenceIds: ["EV-01"],
          }
        : {
            hypothesisId: r.hypothesisId,
            specialist: r.specialist,
            verdict: "contradicts",
            summary: "the pool has idle connections",
            evidenceIds: [],
          };
    const registry = createAgentRegistry({
      deps: testAgentDeps(),
      investigators: fakeInvestigators(script),
    });
    const { harness, root } = await openHarness(registry);
    const acquirer = await root.commit(
      (tx) => launchInvestigation(tx, request({ hypothesisId: "H1", specialist: "acquirer" })),
      BACKGROUND_CONTEXT,
    );
    const db = await root.commit(
      (tx) => launchInvestigation(tx, request({ hypothesisId: "H2", specialist: "db" })),
      BACKGROUND_CONTEXT,
    );

    const acquirerSettled = await harness.waitForTask(acquirer, BACKGROUND_CONTEXT);
    const dbSettled = await harness.waitForTask(db, BACKGROUND_CONTEXT);

    expect(acquirerSettled.state.outcome).toEqual({
      status: "completed",
      result: {
        hypothesisId: "H1",
        specialist: "acquirer",
        verdict: "supports",
        summary: "acquirer-beta p95 is 8,012 ms",
        evidenceIds: ["EV-01"],
      },
    });
    expect(dbSettled.state.outcome).toEqual({
      status: "completed",
      result: {
        hypothesisId: "H2",
        specialist: "db",
        verdict: "contradicts",
        summary: "the pool has idle connections",
        evidenceIds: [],
      },
    });
    const installed = registry
      .snapshot()
      .installed()
      .map((extension) => extension.name);
    expect(installed.filter((name) => name === "warroom.investigators")).toHaveLength(1);
    expect(JSON.stringify([acquirerSettled.state.outcome, dbSettled.state.outcome])).not.toContain(
      "investigator not implemented",
    );
  });

  test("fake rejects an off-contract finding", async () => {
    const offContract = (r: InvestigationRequest) =>
      ({
        hypothesisId: r.hypothesisId,
        specialist: r.specialist,
        verdict: "maybe",
        summary: "unsure",
        evidenceIds: [],
      }) as unknown as InvestigationFinding;
    const registry = createAgentRegistry({
      deps: testAgentDeps(),
      investigators: fakeInvestigators(offContract),
    });
    const { harness, root } = await openHarness(registry);
    const id = await root.commit(
      (tx) => launchInvestigation(tx, request({ specialist: "logs" })),
      BACKGROUND_CONTEXT,
    );

    const settled = await harness.waitForTask(id, BACKGROUND_CONTEXT);

    expect(settled.state.outcome.status).toBe("failed");
    expect(settled.state.outcome.result).toBeUndefined();
    expect(settled.state.outcome.error?.message).toContain("invalid_investigation_finding");
  });
});
