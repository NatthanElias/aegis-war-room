import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase, TEST_DATABASE_URL } from "../../../test-support/database.ts";
import { type DatabaseProxy, startProxy } from "../../../test-support/proxy.ts";
import { type RunningService, sleep, startService } from "../../../test-support/service.ts";
import { runMigrations } from "../../card-auth-sandbox/src/migrations.ts";

const mainScript = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const migrationsDir = fileURLToPath(new URL("../../card-auth-sandbox/migrations", import.meta.url));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A migrated test database, a proxy to it that starts out refusing, and the war room server pointed at the proxy. */
async function serverBehindProxy(): Promise<{ proxy: DatabaseProxy; service: RunningService }> {
  const db = await createTestDatabase();
  cleanups.push(() => db.drop());
  const admin = new pg.Client({ connectionString: db.url });
  await admin.connect();
  try {
    await runMigrations(admin, migrationsDir);
  } finally {
    await admin.end();
  }

  const incidentsDir = await mkdtemp(join(tmpdir(), "wr-healthz-"));
  cleanups.push(() => rm(incidentsDir, { recursive: true, force: true }));
  const proxy = await startProxy();
  cleanups.push(() => proxy.close());
  const url = new URL(db.roleUrl("warroom_diag"));
  url.hostname = "127.0.0.1";
  url.port = String(proxy.port);
  const service = await startService(mainScript, {
    DATABASE_URL: url.toString(),
    INCIDENTS_DIR: incidentsDir,
    INCIDENT_ID: "test-inc",
    SANDBOX_URL: "http://127.0.0.1:1",
  });
  cleanups.push(() => service.stop());
  return { proxy, service };
}

describe("warroom-server healthz", () => {
  test("database down: the process keeps running, answers 503 starting, and retries", async () => {
    const { proxy, service } = await serverBehindProxy();

    await sleep(3000);

    expect(service.running).toBe(true);
    expect(await service.healthz()).toEqual({ status: 503, body: { status: "starting" } });
    expect(proxy.attempts).toBeGreaterThanOrEqual(3);
  });

  test("database recovers: healthz turns 200 ok within 3 s without a restart", async () => {
    const { proxy, service } = await serverBehindProxy();
    expect((await service.healthz()).status).toBe(503);
    const pid = service.pid;

    const target = new URL(TEST_DATABASE_URL);
    proxy.forwardTo(target.hostname, Number(target.port));
    const startedAt = Date.now();
    let last = await service.healthz();
    while (last.status !== 200 && Date.now() - startedAt < 3000) {
      await sleep(100);
      last = await service.healthz();
    }

    expect(last).toEqual({ status: 200, body: { status: "ok" } });
    expect(service.running).toBe(true);
    expect(service.pid).toBe(pid);
  });
});
