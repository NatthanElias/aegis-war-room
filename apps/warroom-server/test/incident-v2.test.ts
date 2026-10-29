import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, defineDoc, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { Incident } from "@warroom/contracts";
import { afterEach, describe, expect, test } from "vitest";
import { openIncident } from "../../../test-support/incident-client.ts";
import {
  makeTempIncidents,
  SEEDED_ROSTER,
  TEST_INCIDENT_ID,
} from "../../../test-support/incident-server.ts";
import { openIncidentStore } from "../src/incident-store.ts";
import { startServer } from "../src/server.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

// Why: these are functions so each use gets a fresh object and no assertion compares an object with itself.
const hypothesisH1 = () => ({
  id: "H1",
  title: "Acquirer beta is slow",
  status: "active" as const,
  supportingEvidenceIds: ["EV-01"],
  contradictingEvidenceIds: [],
  missingEvidence: [],
  createdAt: "2026-10-28T12:00:00Z",
});
const evidenceEV01 = () => ({
  id: "EV-01",
  hypothesisId: "H1",
  observation: "acquirer-beta p95 latency is 8,012 ms",
  quote: "p95: 8012",
  source: { kind: "receipt" as const, receiptIds: ["call-7"] },
  createdAt: "2026-10-28T12:01:00Z",
});

describe("app.warroom version 2", () => {
  test("new incident is version 2", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wr-v2-new-"));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));

    const store = await openIncidentStore(dir, TEST_INCIDENT_ID);
    const doc = await store.readIncident();
    await store.close();

    expect(doc).toEqual({
      sev: "SEV-1",
      phase: "DETECT",
      roster: SEEDED_ROSTER,
      hypotheses: {},
      evidence: {},
      alerts: {},
    });
  });

  test("migrates a version 1 incident", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wr-v2-migrate-"));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));
    // Why: the version 1 definition is declared here, not imported, so the file is written by the format
    // that shipped and not by whatever the current code believes version 1 was.
    const VersionOne = defineDoc<{
      sev: string;
      phase: string;
      roster: Record<string, { id: string; role: string }>;
    }>({
      kind: "app.warroom",
      version: 1,
      scope: "session",
      initial: () => ({
        sev: "SEV-1",
        phase: "DETECT",
        roster: {
          alice: { id: "alice", role: "IC" },
          bob: { id: "bob", role: "Responder" },
          carol: { id: "carol", role: "Observer" },
        },
      }),
      checkpointWhen: () => false,
    });
    const harness = await Harness.open(
      await openNodeSqliteStorage(join(dir, `${TEST_INCIDENT_ID}.db`)),
      { models: createModels(), registry: createRegistry() },
      BACKGROUND_CONTEXT,
    );
    await harness.root(BACKGROUND_CONTEXT);
    await harness.commit(async (tx) => {
      const doc = await tx.doc(VersionOne);
      doc.sev = "SEV-2";
      doc.phase = "TRIAGE";
    }, BACKGROUND_CONTEXT);
    // Context: the file now holds a version 1 value with no version 2 field.
    expect(await harness.snapshot(VersionOne, BACKGROUND_CONTEXT)).toEqual({
      sev: "SEV-2",
      phase: "TRIAGE",
      roster: SEEDED_ROSTER,
    });
    await harness.close(BACKGROUND_CONTEXT);

    const expected = {
      sev: "SEV-2",
      phase: "TRIAGE",
      roster: SEEDED_ROSTER,
      hypotheses: {},
      evidence: {},
      alerts: {},
    };
    const first = await openIncidentStore(dir, TEST_INCIDENT_ID);
    const afterMigration = await first.readIncident();
    await first.close();
    const second = await openIncidentStore(dir, TEST_INCIDENT_ID);
    const afterReopen = await second.readIncident();
    await second.close();

    expect(afterMigration).toEqual(expected);
    expect(afterReopen).toEqual(expected);
  });

  test("hypotheses and evidence survive reopen", async () => {
    const dir = await mkdtemp(join(tmpdir(), "wr-v2-durable-"));
    cleanups.push(() => rm(dir, { recursive: true, force: true }));

    const writer = await openIncidentStore(dir, TEST_INCIDENT_ID);
    await writer.commitIncident((doc) => {
      doc.hypotheses.H1 = hypothesisH1();
      doc.evidence["EV-01"] = evidenceEV01();
    });
    await writer.close();
    const reader = await openIncidentStore(dir, TEST_INCIDENT_ID);
    const doc = await reader.readIncident();
    await reader.close();

    expect(doc.hypotheses).toEqual({ H1: hypothesisH1() });
    expect(doc.evidence).toEqual({ "EV-01": evidenceEV01() });
  });

  test("browser state stays version 1", async () => {
    const incidents = await makeTempIncidents();
    cleanups.push(incidents.remove);
    await incidents.seed((doc) => {
      doc.hypotheses.H1 = hypothesisH1();
      doc.evidence["EV-01"] = evidenceEV01();
    });
    const server = await startServer(incidents.serverOptions());
    let running = true;
    cleanups.push(async () => {
      if (running) await server.close();
    });
    const alice = await openIncident(server.port, "alice");
    cleanups.push(async () => alice.close());

    // Why: a second state arrives from a commit while connected, and it must carry the same keys as the first.
    await alice.setSev("SEV-2");
    await alice.waitFor((state) => state.sev === "SEV-2", 1000);

    expect(alice.states.length).toBeGreaterThanOrEqual(2);
    for (const state of alice.states) {
      expect(Object.keys(state).sort()).toEqual(["phase", "roster", "sev"]);
    }
    // Why: the client builds each state object from three fixed members, so the keys above cannot show a member
    // the server added. The contract's declared state members can.
    const declared = Object.entries(Incident.description.variants.default ?? {})
      .filter(([, member]) => member.kind === "state")
      .map(([name]) => name)
      .sort();
    expect(declared).toEqual(["phase", "roster", "sev"]);
    // Context: the served document really holds the version 2 fields the browser must not see.
    running = false;
    await server.close();
    const stored = await incidents.read();
    expect(Object.keys(stored.hypotheses)).toEqual(["H1"]);
    expect(Object.keys(stored.evidence)).toEqual(["EV-01"]);
  });
});
