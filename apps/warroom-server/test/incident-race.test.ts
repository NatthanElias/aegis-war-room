import { isChordError } from "@earendil-works/chord";
import { afterEach, expect, test, vi } from "vitest";
import { openIncident } from "../../../test-support/incident-client.ts";
import { makeTempIncidents } from "../../../test-support/incident-server.ts";
import { openIncidentStore } from "../src/incident-store.ts";
import { startServer } from "../src/server.ts";

// Why: in one process a commit is pure microtasks, so two calls never overlap. Delaying the commit makes both
// calls reach it together, which is what a slower disk or a busier host does.
vi.mock("../src/incident-store.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/incident-store.ts")>();
  return {
    ...original,
    openIncidentStore: vi.fn(async (...args: Parameters<typeof original.openIncidentStore>) => {
      const store = await original.openIncidentStore(...args);
      return {
        ...store,
        commitIncident: async (change: Parameters<typeof store.commitIncident>[0]) => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return store.commitIncident(change);
        },
      };
    }),
  };
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

test("slow commit: the check inside the commit rejects the duplicate move", async () => {
  const incidents = await makeTempIncidents();
  cleanups.push(incidents.remove);
  await incidents.seed((doc) => {
    doc.phase = "TRIAGE";
  });
  const server = await startServer(incidents.serverOptions());
  cleanups.push(() => server.close());
  const first = await openIncident(server.port, "alice");
  const second = await openIncident(server.port, "alice");
  cleanups.push(async () => {
    first.close();
    second.close();
  });
  expect(vi.mocked(openIncidentStore)).toHaveBeenCalled();

  const results = await Promise.allSettled([
    first.setPhase("MITIGATE"),
    second.setPhase("MITIGATE"),
  ]);

  expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
  const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
  expect(isChordError(rejected.reason, "invalid")).toBe(true);
  await first.waitFor((state) => state.phase === "MITIGATE", 1000, 1);
});
