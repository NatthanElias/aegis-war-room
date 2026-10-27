import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { openNodeSqliteStorage } from "@earendil-works/pi-durable/storage/sqlite/node";
import { afterEach, describe, expect, test, vi } from "vitest";
import { openShell } from "../../../test-support/shell-client.ts";
import { startServer } from "../src/server.ts";

// Why: observe the real storage boundary so a fresh replacement file cannot pass on root ID 1 alone.
vi.mock("@earendil-works/pi-durable/storage/sqlite/node", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@earendil-works/pi-durable/storage/sqlite/node")>();
  return { ...original, openNodeSqliteStorage: vi.fn(original.openNodeSqliteStorage) };
});

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("durable incident file", () => {
  test("same conversation after restart", async () => {
    const incidentsDir = await mkdtemp(join(tmpdir(), "wr-incidents-"));
    cleanups.push(() => rm(incidentsDir, { recursive: true, force: true }));
    const file = join(incidentsDir, "test-inc.db");
    const options = {
      port: 0,
      host: "127.0.0.1",
      incidentId: "test-inc",
      incidentsDir,
      sandboxUrl: "http://127.0.0.1:1",
    };

    vi.mocked(openNodeSqliteStorage).mockClear();
    const first = await startServer(options);
    const firstShell = await openShell(first.port, "alice");
    const firstConversation = firstShell.latest().conversationId;
    firstShell.close();
    await first.close();

    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
    // Why: the marker detects deleting and recreating the original file; the storage calls below prove its use.
    const marker = new DatabaseSync(file);
    marker.exec("CREATE TABLE restart_marker (id integer)");
    marker.close();

    const second = await startServer(options);
    const secondShell = await openShell(second.port, "alice");
    const secondConversation = secondShell.latest().conversationId;
    const openedFiles = vi.mocked(openNodeSqliteStorage).mock.calls.map(([path]) => path);
    secondShell.close();
    await second.close();

    expect(openedFiles).toEqual([file, file]);
    expect(secondConversation).toBe(firstConversation);
    const reopened = new DatabaseSync(file);
    const tables = reopened
      .prepare("SELECT name FROM sqlite_master WHERE name = 'restart_marker'")
      .all();
    reopened.close();
    expect(tables).toHaveLength(1);
  });
});
