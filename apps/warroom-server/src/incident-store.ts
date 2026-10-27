import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { BACKGROUND_CONTEXT } from "@earendil-works/chord/context";
import { createModels } from "@earendil-works/pi-ai/models";
import { createRegistry, Harness } from "@earendil-works/pi-durable";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";

export interface IncidentStore {
  readonly file: string;
  readonly conversationId: number;
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
  return {
    file,
    conversationId: root.id,
    close: () => harness.close(BACKGROUND_CONTEXT),
  };
}
