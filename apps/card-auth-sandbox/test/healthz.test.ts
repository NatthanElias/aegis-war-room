import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterEach, describe, expect, test } from "vitest";
import {
  createTestDatabase,
  TEST_DATABASE_URL,
  type TestDatabase,
} from "../../../test-support/database.ts";
import { type DatabaseProxy, startProxy } from "../../../test-support/proxy.ts";
import { type RunningService, sleep, startService } from "../../../test-support/service.ts";
import { runMigrations } from "../src/migrations.ts";

const mainScript = fileURLToPath(new URL("../src/main.ts", import.meta.url));
const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

/** A migrated test database, a proxy to it that starts out refusing, and the sandbox pointed at the proxy. */
async function sandboxBehindProxy(): Promise<{ proxy: DatabaseProxy; service: RunningService }> {
  const db: TestDatabase = await createTestDatabase();
  cleanups.push(() => db.drop());
  const admin = new pg.Client({ connectionString: db.url });
  await admin.connect();
  try {
    await runMigrations(admin, migrationsDir);
  } finally {
    await admin.end();
  }

  const proxy = await startProxy();
  cleanups.push(() => proxy.close());
  const url = new URL(db.roleUrl("sandbox_app"));
  url.hostname = "127.0.0.1";
  url.port = String(proxy.port);
  const service = await startService(mainScript, { DATABASE_URL: url.toString() });
  cleanups.push(() => service.stop());
  return { proxy, service };
}

describe("card-auth-sandbox healthz", () => {
  test("database down: the process keeps running, answers 503 starting, and retries", async () => {
    const { proxy, service } = await sandboxBehindProxy();

    await sleep(3000);

    expect(service.running).toBe(true);
    expect(await service.healthz()).toEqual({ status: 503, body: { status: "starting" } });
    expect(proxy.attempts).toBeGreaterThanOrEqual(3);
  });

  test("database recovers: healthz turns 200 ok within 3 s without a restart", async () => {
    const { proxy, service } = await sandboxBehindProxy();
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
