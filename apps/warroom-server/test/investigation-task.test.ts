import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { Harness, MemoryStorage, type Registry } from "@earendil-works/pi-durable";
import type { InvestigationRequest } from "@warroom/contracts";
import { afterEach, describe, expect, test } from "vitest";
import { testAgentDeps } from "../../../test-support/agent-deps.ts";
import { createAgentRegistry, launchInvestigation } from "../src/agents/index.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
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

const request = (overrides: Partial<InvestigationRequest> = {}): InvestigationRequest => ({
  hypothesisId: "H1",
  specialist: "db",
  question: "Is the pool saturated?",
  since: "2026-10-28T11:00:00Z",
  until: "2026-10-28T12:00:00Z",
  ...overrides,
});

describe("warroom.investigation task", () => {
  test("rejects an invalid request", async () => {
    const { harness, root } = await openHarness(createAgentRegistry({ deps: testAgentDeps() }));
    const liveTasks = async () => {
      const graph = await harness.taskGraph(BACKGROUND_CONTEXT);
      const nodes = Object.values(graph.value.tasks).map(({ kind, background }) => ({
        kind,
        background,
      }));
      graph.dispose();
      return nodes;
    };
    const created = [{ kind: "warroom.investigation", background: true }];
    // Why: the task graph lists live tasks and nothing runs until a wait or resume, so a valid launch is the
    // control that shows this graph does see a created investigation.
    await root.commit((tx) => launchInvestigation(tx, request()), BACKGROUND_CONTEXT);
    expect(await liveTasks()).toEqual(created);

    const invalid = request({ specialist: "network" as never });
    const launch = root.commit((tx) => launchInvestigation(tx, invalid), BACKGROUND_CONTEXT);

    await expect(launch).rejects.toThrow("invalid_investigation_request");
    expect(await liveTasks()).toEqual(created);
  });

  test("stub finishes inconclusive", async () => {
    const { harness, root } = await openHarness(createAgentRegistry({ deps: testAgentDeps() }));
    const first = await root.commit(
      (tx) => launchInvestigation(tx, request({ hypothesisId: "H1", specialist: "db" })),
      BACKGROUND_CONTEXT,
    );
    const second = await root.commit(
      (tx) => launchInvestigation(tx, request({ hypothesisId: "H2", specialist: "acquirer" })),
      BACKGROUND_CONTEXT,
    );

    const firstSettled = await harness.waitForTask(first, BACKGROUND_CONTEXT);
    const secondSettled = await harness.waitForTask(second, BACKGROUND_CONTEXT);

    expect(firstSettled.state.outcome).toEqual({
      status: "completed",
      result: {
        hypothesisId: "H1",
        specialist: "db",
        verdict: "inconclusive",
        summary: "investigator not implemented",
        evidenceIds: [],
      },
    });
    expect(secondSettled.state.outcome).toMatchObject({
      status: "completed",
      result: { hypothesisId: "H2", specialist: "acquirer" },
    });
  });
});
