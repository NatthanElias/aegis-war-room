import { existsSync, statSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, test } from "vitest";
import { openShell } from "../../../test-support/shell-client.ts";
import { startServer } from "../src/server.ts";

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

    const first = await startServer(options);
    const firstShell = await openShell(first.port, "alice");
    const firstConversation = firstShell.latest().conversationId;
    firstShell.close();
    await first.close();

    expect(existsSync(file)).toBe(true);
    expect(statSync(file).size).toBeGreaterThan(0);
    // A marker table proves the second run reopens this file instead of creating a fresh one.
    const marker = new DatabaseSync(file);
    marker.exec("CREATE TABLE restart_marker (id integer)");
    marker.close();

    const second = await startServer(options);
    const secondShell = await openShell(second.port, "alice");
    const secondConversation = secondShell.latest().conversationId;
    secondShell.close();
    await second.close();

    expect(secondConversation).toBe(firstConversation);
    const reopened = new DatabaseSync(file);
    const tables = reopened
      .prepare("SELECT name FROM sqlite_master WHERE name = 'restart_marker'")
      .all();
    reopened.close();
    expect(tables).toHaveLength(1);
  });
});
