import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import pg, { type Client } from "pg";

export interface MigrationResult {
  readonly applied: readonly string[];
}

export class MigrationFailed extends Error {
  readonly file: string;
  readonly applied: readonly string[];

  constructor(file: string, applied: readonly string[], cause: unknown) {
    super(`migration ${file} failed: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    });
    this.file = file;
    this.applied = applied;
  }
}

/**
 * Applies each `*.sql` file in `dir` that `sandbox_migrations` does not list yet, in name order.
 * Each file runs in its own transaction together with its ledger row, so a failing file leaves
 * nothing behind and earlier files stay recorded.
 */
export async function runMigrations(client: Client, dir: string): Promise<MigrationResult> {
  await client.query(
    `CREATE TABLE IF NOT EXISTS sandbox_migrations (
       name text PRIMARY KEY,
       applied_at timestamptz NOT NULL DEFAULT now()
     )`,
  );
  const recorded = await client.query<{ name: string }>("SELECT name FROM sandbox_migrations");
  const done = new Set(recorded.rows.map((row) => row.name));
  const files = (await readdir(dir)).filter((name) => name.endsWith(".sql")).sort();

  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = await readFile(join(dir, file), "utf8");
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO sandbox_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw new MigrationFailed(file, applied, error);
    }
    applied.push(file);
  }
  return { applied };
}

/** Milliseconds `migrate` keeps retrying an unreachable database before it gives up. */
export const DEFAULT_MIGRATE_TIMEOUT_MS = 60_000;
const RETRY_INTERVAL_MS = 1000;

export function resolveMigrateTimeoutMs(env: Record<string, string | undefined>): number {
  const raw = env.MIGRATE_TIMEOUT_MS;
  if (raw === undefined || raw === "") return DEFAULT_MIGRATE_TIMEOUT_MS;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`MIGRATE_TIMEOUT_MS must be a positive integer, got "${raw}"`);
  }
  return value;
}

/** Connects once per second until it succeeds or `timeoutMs` has passed since the first attempt. */
export async function connectWithRetry(
  connectionString: string,
  timeoutMs: number,
  log: (message: string) => void = () => undefined,
): Promise<Client> {
  const start = Date.now();
  for (let attempt = 1; ; attempt++) {
    const client = new pg.Client({ connectionString, connectionTimeoutMillis: 5000 });
    // Why: pg emits `error` on a dropped connection; without a listener that would crash the process.
    client.on("error", () => undefined);
    try {
      await client.connect();
      return client;
    } catch (error) {
      await client.end().catch(() => undefined);
      if (Date.now() - start >= timeoutMs) {
        throw new Error(`database unreachable after ${attempt} attempts: ${String(error)}`);
      }
      log(`database not reachable (attempt ${attempt}), retrying in ${RETRY_INTERVAL_MS} ms`);
      await new Promise((resolve) => setTimeout(resolve, RETRY_INTERVAL_MS));
    }
  }
}
