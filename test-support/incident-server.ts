import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncidentDoc } from "../apps/warroom-server/src/incident-store.ts";
import { openIncidentStore } from "../apps/warroom-server/src/incident-store.ts";
import type { ServerOptions } from "../apps/warroom-server/src/server.ts";

export const TEST_INCIDENT_ID = "test-inc";

/** The roster every new incident starts with, written out so no test derives it from production constants. */
export const SEEDED_ROSTER = {
  alice: { id: "alice", role: "IC" },
  bob: { id: "bob", role: "Responder" },
  carol: { id: "carol", role: "Observer" },
} as const;

export interface TempIncidents {
  readonly dir: string;
  /** Options for `startServer` on this folder; the sandbox is unreachable, which these tests do not use. */
  serverOptions(): ServerOptions;
  /** Opens the incident file as a store, applies `change` to `app.warroom` in one commit, and closes it again. */
  seed(change: (doc: IncidentDoc) => void): Promise<void>;
  /** Opens the incident file as a store and returns its committed `app.warroom`. */
  read(): Promise<Readonly<IncidentDoc>>;
  remove(): Promise<void>;
}

export async function makeTempIncidents(): Promise<TempIncidents> {
  const dir = await mkdtemp(join(tmpdir(), "wr-incident-"));
  return {
    dir,
    serverOptions: () => ({
      port: 0,
      host: "127.0.0.1",
      incidentId: TEST_INCIDENT_ID,
      incidentsDir: dir,
      sandboxUrl: "http://127.0.0.1:1",
    }),
    async seed(change) {
      const store = await openIncidentStore(dir, TEST_INCIDENT_ID);
      try {
        await store.commitIncident(change);
      } finally {
        await store.close();
      }
    },
    async read() {
      const store = await openIncidentStore(dir, TEST_INCIDENT_ID);
      try {
        return await store.readIncident();
      } finally {
        await store.close();
      }
    },
    remove: () => rm(dir, { recursive: true, force: true }),
  };
}
