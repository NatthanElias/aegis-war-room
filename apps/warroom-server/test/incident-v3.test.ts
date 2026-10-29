import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, defineDoc, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, test } from "vitest";
import { SEEDED_ROSTER, TEST_INCIDENT_ID } from "../../../test-support/incident-server.ts";
import { openIncidentStore } from "../src/incident-store.ts";
import { resolveModels } from "../src/models.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

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

async function tempDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wr-v3-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  return dir;
}

describe("app.warroom version 3", () => {
  test("migrates a version 2 incident", async () => {
    const dir = await tempDir();
    // Why: the version 2 definition is declared here, not imported, so the file is written by the format that
    // shipped and not by whatever the current code believes version 2 was.
    const VersionTwo = defineDoc<{
      sev: string;
      phase: string;
      roster: Record<string, { id: string; role: string }>;
      hypotheses: Record<string, ReturnType<typeof hypothesisH1>>;
      evidence: Record<string, ReturnType<typeof evidenceEV01>>;
    }>({
      kind: "app.warroom",
      version: 2,
      scope: "session",
      initial: () => ({
        sev: "SEV-1",
        phase: "DETECT",
        roster: {
          alice: { id: "alice", role: "IC" },
          bob: { id: "bob", role: "Responder" },
          carol: { id: "carol", role: "Observer" },
        },
        hypotheses: {},
        evidence: {},
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
      const doc = await tx.doc(VersionTwo);
      doc.sev = "SEV-2";
      doc.phase = "TRIAGE";
      doc.hypotheses.H1 = hypothesisH1();
      doc.evidence["EV-01"] = evidenceEV01();
    }, BACKGROUND_CONTEXT);
    // Context: the file now holds a version 2 value with no `alerts` field, so the migration has work to do.
    expect(
      Object.keys((await harness.snapshot(VersionTwo, BACKGROUND_CONTEXT)) ?? {}).sort(),
    ).toEqual(["evidence", "hypotheses", "phase", "roster", "sev"]);
    await harness.close(BACKGROUND_CONTEXT);

    const expected = {
      sev: "SEV-2",
      phase: "TRIAGE",
      roster: SEEDED_ROSTER,
      hypotheses: { H1: hypothesisH1() },
      evidence: { "EV-01": evidenceEV01() },
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

  test("model applies on reopen", async () => {
    const dir = await tempDir();
    const { models } = resolveModels({});
    const modelOf = async (modelId: string) => {
      const store = await openIncidentStore(dir, TEST_INCIDENT_ID, {
        models,
        model: { provider: "openrouter", modelId },
      });
      const agent = await store.root.agent(BACKGROUND_CONTEXT);
      await store.close();
      return agent.model;
    };

    const first = await modelOf("anthropic/claude-haiku-5.5");
    const second = await modelOf("anthropic/claude-sonnet-5.5");

    expect(first).toEqual({ provider: "openrouter", modelId: "anthropic/claude-haiku-5.5" });
    expect(second).toEqual({ provider: "openrouter", modelId: "anthropic/claude-sonnet-5.5" });
  });
});
