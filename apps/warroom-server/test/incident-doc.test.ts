import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import pg from "pg";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createTestDatabase } from "../../../test-support/database.ts";
import { openIncident } from "../../../test-support/incident-client.ts";
import {
  makeTempIncidents,
  SEEDED_ROSTER,
  TEST_INCIDENT_ID,
} from "../../../test-support/incident-server.ts";
import { type RunningService, startService } from "../../../test-support/service.ts";
import { runMigrations } from "../../card-auth-sandbox/src/migrations.ts";
import { startServer } from "../src/server.ts";

const mainScript = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const migrationsDir = fileURLToPath(new URL("../../card-auth-sandbox/migrations", import.meta.url));

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
    // Why: reading the file after the server closed shows the value came from the stored document. Version 2 of
    // the document adds the two empty records the browser never receives.
    expect(await incidents.read()).toEqual({ ...expected, hypotheses: {}, evidence: {} });
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

  test("resolved phase survives SIGKILL", async () => {
    const incidents = await makeTempIncidents();
    cleanups.push(incidents.remove);
    const db = await createTestDatabase();
    cleanups.push(() => db.drop());
    const admin = new pg.Client({ connectionString: db.url });
    await admin.connect();
    try {
      await runMigrations(admin, migrationsDir);
    } finally {
      await admin.end();
    }
    const start = async (): Promise<RunningService> => {
      const service = await startService(mainScript, {
        DATABASE_URL: db.roleUrl("warroom_diag"),
        INCIDENTS_DIR: incidents.dir,
        INCIDENT_ID: TEST_INCIDENT_ID,
        SANDBOX_URL: "http://127.0.0.1:1",
      });
      cleanups.push(() => service.stop());
      return service;
    };

    const first = await start();
    const alice = await openIncident(first.port, "alice");
    expect(alice.latest().phase).toBe("DETECT");
    await alice.setPhase("TRIAGE");
    // Hazard: no graceful close. The kill must follow the resolved call directly, or a late commit could slip in.
    const exited = new Promise((resolve) => first.child.once("exit", resolve));
    first.child.kill("SIGKILL");
    await exited;
    alice.close();
    expect(first.child.signalCode).toBe("SIGKILL");

    const second = await start();
    const bob = await openIncident(second.port, "bob");
    expect(bob.latest().phase).toBe("TRIAGE");
    bob.close();
  });
});
