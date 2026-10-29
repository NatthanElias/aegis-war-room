import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Draft } from "@earendil-works/chord";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels, type Models } from "@earendil-works/pi-ai/models";
import {
  type Conversation,
  createRegistry,
  type DocumentWatch,
  defineDoc,
  Harness,
  type ModelRef,
  type Registry,
} from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import {
  type Alert,
  type Evidence,
  type Hypothesis,
  type Phase,
  type Roster,
  SEEDED_USERS,
  type Severity,
} from "@warroom/contracts";

/** The stored value of `app.warroom` version 3. */
// Context: a type alias, not an interface, because pi-durable documents must be assignable to `JsonObject`.
export type IncidentDoc = {
  sev: Severity;
  phase: Phase;
  roster: Roster;
  /** Keyed by hypothesis ID (`H1`, `H2`, ...). */
  hypotheses: Record<string, Hypothesis>;
  /** Keyed by evidence ID (`EV-01`, `EV-02`, ...); a record is never changed once written. */
  evidence: Record<string, Evidence>;
  /** Keyed by alert ID (`AL-01`, `AL-02`, ...); an alert changes only from `firing` to `resolved`. */
  alerts: Record<string, Alert>;
};

/** Why: a complete base after 49 deltas gives "checkpointed every 50 operations" and bounds replay on open. */
const DELTAS_PER_CHECKPOINT = 49;

/**
 * The incident state: one Session document per incident file.
 * Context: `kind` and `version` are part of the stored format, and later features add fields with a version bump.
 */
export const AppWarroom = defineDoc<IncidentDoc>({
  kind: "app.warroom",
  version: 3,
  scope: "session",
  initial: () => ({
    sev: "SEV-1",
    phase: "DETECT",
    roster: {
      alice: { ...SEEDED_USERS.alice },
      bob: { ...SEEDED_USERS.bob },
      carol: { ...SEEDED_USERS.carol },
    },
    hypotheses: {},
    evidence: {},
    alerts: {},
  }),
  // Hazard: a stored version 3 cannot be read by version 2 code. pi-durable calls this once with the stored
  // version, so it must reach the current shape from every older version, including the demo volume's version 1.
  migrate: (value, fromVersion) => {
    if (fromVersion !== 1 && fromVersion !== 2) {
      throw new Error(`app.warroom cannot migrate from version ${fromVersion}`);
    }
    const base = value as Omit<IncidentDoc, "hypotheses" | "evidence" | "alerts"> &
      Partial<Pick<IncidentDoc, "hypotheses" | "evidence">>;
    return {
      ...base,
      hypotheses: base.hypotheses ?? {},
      evidence: base.evidence ?? {},
      alerts: {},
    };
  },
  checkpointWhen: (_value, _ops, info) => info.deltasSinceBase >= DELTAS_PER_CHECKPOINT,
});

export interface IncidentStore {
  readonly file: string;
  readonly conversationId: number;
  /** Context: exposed so `alerts/` can submit root input; the store still owns open and close. */
  readonly harness: Harness;
  readonly root: Conversation;
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

/** What the Harness runs agents with. */
export interface IncidentAgents {
  readonly registry?: Registry;
  readonly models?: Models;
  /** The root conversation's model; applied on every open, so a changed setting takes effect after a restart. */
  readonly model?: ModelRef;
}

/**
 * Opens (or creates) `{incidentsDir}/{incidentId}.db` and its root conversation.
 * Context: one SQLite file per incident ID; the same ID reopens the same file and the same root conversation.
 * Without `agents` the Harness opens with an empty registry and an empty `createModels()`, which makes no model calls.
 */
export async function openIncidentStore(
  incidentsDir: string,
  incidentId: string,
  agents: IncidentAgents = {},
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
    { models: agents.models ?? createModels(), registry: agents.registry ?? createRegistry() },
    BACKGROUND_CONTEXT,
  );
  const root = await harness.root(BACKGROUND_CONTEXT);
  if (agents.model !== undefined) await root.configure({ model: agents.model }, BACKGROUND_CONTEXT);
  // Why: reading a missing document through `tx.doc` creates it from `initial()` in this commit, and an
  // existing document keeps its stored value, so a restart never resets the incident.
  await harness.commit(async (tx) => {
    await tx.doc(AppWarroom);
  }, BACKGROUND_CONTEXT);
  return {
    file,
    conversationId: root.id,
    harness,
    root,
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
