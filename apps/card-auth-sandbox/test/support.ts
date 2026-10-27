import { fileURLToPath } from "node:url";
import pg from "pg";
import { createTestDatabase, type TestDatabase } from "../../../test-support/database.ts";
import { type Acquirers, createAcquirers } from "../src/acquirers.ts";
import { runMigrations } from "../src/migrations.ts";
import type { AcquirerName } from "../src/routing.ts";
import { type RunningSandbox, type SandboxOptions, startSandbox } from "../src/server.ts";

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));

export interface RecordedCall {
  readonly acquirer: AcquirerName;
  readonly traceId: string;
  readonly amountCents: number;
}

/** Wraps acquirers so a test can see every call, and make one acquirer throw. */
export function recordingAcquirers(options: { failing?: AcquirerName } = {}) {
  const inner = createAcquirers();
  const calls: RecordedCall[] = [];
  const acquirers: Acquirers = {
    async call(acquirer, request) {
      calls.push({ acquirer, traceId: request.traceId, amountCents: request.amountCents });
      if (acquirer === options.failing) throw new Error(`${acquirer} exploded`);
      return inner.call(acquirer, request);
    },
    setDelay: (acquirer, ms) => inner.setDelay(acquirer, ms),
  };
  return { acquirers, calls };
}

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Polls `read` every 25 ms until it returns a value other than `undefined`, or fails after `timeoutMs`. */
export async function waitFor<T>(
  what: string,
  read: () => Promise<T | undefined> | T | undefined,
  timeoutMs: number,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await read();
    if (value !== undefined) return value;
    if (Date.now() > deadline)
      throw new Error(`timed out after ${timeoutMs} ms waiting for ${what}`);
    await sleep(25);
  }
}

/** Test databases, sandboxes, and clients that one test file opens, closed together by `cleanup`. */
export function createHarness() {
  const cleanups: Array<() => Promise<void>> = [];
  return {
    async cleanup() {
      for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
    },
    /** A throwaway database with the shipped migrations applied. */
    async migratedDatabase(): Promise<TestDatabase> {
      const db = await createTestDatabase();
      cleanups.push(() => db.drop());
      const admin = new pg.Client({ connectionString: db.url });
      await admin.connect();
      try {
        await runMigrations(admin, migrationsDir);
      } finally {
        await admin.end();
      }
      return db;
    },
    async client(url: string): Promise<pg.Client> {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      cleanups.push(() => client.end());
      return client;
    },
    /** A sandbox on port 0 that generates no traffic unless `trafficRate` says so. */
    async sandbox(
      db: TestDatabase,
      options: Partial<SandboxOptions> = {},
    ): Promise<RunningSandbox> {
      const sandbox = await startSandbox({
        port: 0,
        host: "127.0.0.1",
        databaseUrl: db.roleUrl("sandbox_app"),
        ...options,
      });
      cleanups.push(() => sandbox.close());
      return sandbox;
    },
    onCleanup(cleanup: () => Promise<void>) {
      cleanups.push(cleanup);
    },
  };
}

/** The SQLSTATE of the error a promise rejects with. */
export async function sqlState(promise: Promise<unknown>): Promise<string | undefined> {
  try {
    await promise;
  } catch (error) {
    return (error as { code?: string }).code;
  }
  return undefined;
}
