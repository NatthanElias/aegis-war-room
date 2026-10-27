import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "../../../test-support/database.ts";
import { runMigrations } from "../../card-auth-sandbox/src/migrations.ts";
import { createDiagPool } from "../src/diag-pool.ts";

const migrationsDir = fileURLToPath(new URL("../../card-auth-sandbox/migrations", import.meta.url));
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function migratedDatabase() {
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
}

describe("diagnostic pool", () => {
  test("diagnostic pool connects as warroom_diag with read-only short-lived sessions", async () => {
    const db = await migratedDatabase();
    const pool = createDiagPool(db.roleUrl("warroom_diag"));
    cleanups.push(() => pool.end());

    const { rows } = await pool.query(`SELECT
      current_user AS who,
      current_setting('application_name') AS app,
      current_setting('statement_timeout') AS statement_timeout,
      current_setting('lock_timeout') AS lock_timeout,
      current_setting('default_transaction_read_only') AS read_only`);

    expect(rows).toEqual([
      {
        who: "warroom_diag",
        app: "warroom-diag",
        statement_timeout: "2s",
        lock_timeout: "500ms",
        read_only: "on",
      },
    ]);
    expect(pool.options.max).toBe(2);
  });

  test("diagnostic pool cannot create a table: SQLSTATE 25006", async () => {
    const db = await migratedDatabase();
    const pool = createDiagPool(db.roleUrl("warroom_diag"));
    cleanups.push(() => pool.end());

    await expect(pool.query("CREATE TABLE t (a int)")).rejects.toMatchObject({ code: "25006" });
  });

  test("diagnostic pool refuses a URL for any other role", async () => {
    const db = await migratedDatabase();
    expect(() => createDiagPool(db.url)).toThrow(/warroom_diag/);
  });
});
