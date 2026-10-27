import { DatabaseSync } from "node:sqlite";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openIncident } from "../../../test-support/incident-client.ts";
import {
  makeTempIncidents,
  SEEDED_ROSTER,
  TEST_INCIDENT_ID,
} from "../../../test-support/incident-server.ts";
import { startServer } from "../src/server.ts";

// Why: observe the real storage boundary, so a restarted server that quietly used another file cannot pass
// on the stored phase alone.
vi.mock("@earendil-works/pi-durable/storage/sqlite/node", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@earendil-works/pi-durable/storage/sqlite/node")>();
  return { ...original, openNodeSqliteStorage: vi.fn(original.openNodeSqliteStorage) };
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("app.warroom document", () => {
  test("fresh incident starts at DETECT", async () => {
    const incidents = await makeTempIncidents();
    cleanups.push(incidents.remove);

    const server = await startServer(incidents.serverOptions());
    const alice = await openIncident(server.port, "alice");
    const served = alice.latest();
    alice.close();
    await server.close();

    const expected = { sev: "SEV-1", phase: "DETECT", roster: SEEDED_ROSTER };
    expect(served).toEqual(expected);
    // Why: reading the file after the server closed shows the value came from the stored document.
    expect(await incidents.read()).toEqual(expected);
  });

  test("keeps phase and severity after restart", async () => {
    const incidents = await makeTempIncidents();
    cleanups.push(incidents.remove);
    const file = `${incidents.dir}/${TEST_INCIDENT_ID}.db`;

    const first = await startServer(incidents.serverOptions());
    const firstAlice = await openIncident(first.port, "alice");
    await firstAlice.setPhase("TRIAGE");
    await firstAlice.setPhase("MITIGATE");
    await firstAlice.setSev("SEV-2");
    firstAlice.close();
    await first.close();

    // Why: the marker detects deleting and recreating the file; the storage calls below prove which file was used.
    const marker = new DatabaseSync(file);
    marker.exec("CREATE TABLE restart_marker (id integer)");
    marker.close();

    vi.mocked(openNodeSqliteStorage).mockClear();
    const second = await startServer(incidents.serverOptions());
    const secondAlice = await openIncident(second.port, "alice");
    const served = secondAlice.latest();
    // Why: a change made by the restarted server must land in the original file, not in a replacement.
    await secondAlice.setSev("SEV-3");
    const openedFiles = vi.mocked(openNodeSqliteStorage).mock.calls.map(([path]) => path);
    secondAlice.close();
    await second.close();

    expect(served.phase).toBe("MITIGATE");
    expect(served.sev).toBe("SEV-2");
    expect(openedFiles).toEqual([file]);
    const reopened = new DatabaseSync(file);
    const tables = reopened
      .prepare("SELECT name FROM sqlite_master WHERE name = 'restart_marker'")
      .all();
    reopened.close();
    expect(tables).toHaveLength(1);
    expect(await incidents.read()).toMatchObject({ phase: "MITIGATE", sev: "SEV-3" });
  });
});
