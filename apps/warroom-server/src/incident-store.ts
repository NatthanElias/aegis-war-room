import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Draft } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, type DocumentWatch, defineDoc, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { type Phase, type Roster, SEEDED_USERS, type Severity } from "@warroom/contracts";

/** The stored value of `app.warroom` version 1. */
// Context: a type alias, not an interface, because pi-durable documents must be assignable to `JsonObject`.
export type IncidentDoc = { sev: Severity; phase: Phase; roster: Roster };

/** Why: a complete base after 49 deltas gives "checkpointed every 50 operations" and bounds replay on open. */
const DELTAS_PER_CHECKPOINT = 49;

/**
 * The incident state: one Session document per incident file.
 * Context: `kind` and `version` are part of the stored format, and later features add fields with a version bump.
 */
export const AppWarroom = defineDoc<IncidentDoc>({
  kind: "app.warroom",
  version: 1,
  scope: "session",
  initial: () => ({
    sev: "SEV-1",
    phase: "DETECT",
    roster: {
      alice: { ...SEEDED_USERS.alice },
      bob: { ...SEEDED_USERS.bob },
      carol: { ...SEEDED_USERS.carol },
    },
  }),
  checkpointWhen: (_value, _ops, info) => info.deltasSinceBase >= DELTAS_PER_CHECKPOINT,
});

export interface IncidentStore {
  readonly file: string;
  readonly conversationId: number;
  /** The committed `app.warroom` value. */
  readIncident(): Promise<Readonly<IncidentDoc>>;
  /**
   * Runs `change` on the document inside one serialized pi-durable commit.
   * A throw rolls the whole commit back, and a resolved call means the change is stored.
   */
  commitIncident<T>(change: (doc: Draft<IncidentDoc>) => T): Promise<T>;
  /** Observes every committed revision of `app.warroom`, starting after the revision it was taken at. */
  watchIncident(): Promise<DocumentWatch<IncidentDoc>>;
  close(): Promise<void>;
}

/**
 * Opens (or creates) `{incidentsDir}/{incidentId}.db` and its root conversation.
 * Context: one SQLite file per incident ID; the same ID reopens the same file and the same root conversation.
 * The Harness opens with an empty `createModels()` because the skeleton makes no model calls.
 */
export async function openIncidentStore(
  incidentsDir: string,
  incidentId: string,
): Promise<IncidentStore> {
  // Hazard: the incident ID becomes a file name, so path separators or dots would escape the incidents folder.
  if (!/^[A-Za-z0-9_-]+$/.test(incidentId)) {
    throw new Error(
      `INCIDENT_ID may only contain letters, digits, "-" and "_", got "${incidentId}"`,
    );
  }
  await mkdir(incidentsDir, { recursive: true });
  const file = join(incidentsDir, `${incidentId}.db`);
  const storage = await openNodeSqliteStorage(file);
  const harness = await Harness.open(
    storage,
    { models: createModels(), registry: createRegistry() },
    BACKGROUND_CONTEXT,
  );
  const root = await harness.root(BACKGROUND_CONTEXT);
  // Why: reading a missing document through `tx.doc` creates it from `initial()` in this commit, and an
  // existing document keeps its stored value, so a restart never resets the incident.
  await harness.commit(async (tx) => {
    await tx.doc(AppWarroom);
  }, BACKGROUND_CONTEXT);
  return {
    file,
    conversationId: root.id,
    async readIncident() {
      const doc = await harness.snapshot(AppWarroom, BACKGROUND_CONTEXT);
      if (doc === undefined) throw new Error("app.warroom is missing from an opened incident");
      return doc;
    },
    commitIncident: (change) =>
      harness.commit(async (tx) => change(await tx.doc(AppWarroom)), BACKGROUND_CONTEXT),
    async watchIncident() {
      const watch = await harness.watchDoc(AppWarroom, BACKGROUND_CONTEXT);
      if (watch === undefined) throw new Error("app.warroom is missing from an opened incident");
      return watch;
    },
    close: () => harness.close(BACKGROUND_CONTEXT),
  };
}
