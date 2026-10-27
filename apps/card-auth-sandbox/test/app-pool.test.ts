import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterEach, describe, expect, test } from "vitest";
import { createTestDatabase } from "../../../test-support/database.ts";
import { createAppPool } from "../src/app-pool.ts";
import { runMigrations } from "../src/migrations.ts";

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
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

describe("app pool", () => {
  test("app pool connects as sandbox_app with its application name and 10 connections", async () => {
    const db = await migratedDatabase();
    const pool = createAppPool(db.roleUrl("sandbox_app"));
    cleanups.push(() => pool.end());

    const { rows } = await pool.query(
      "SELECT current_user AS who, current_setting('application_name') AS app",
    );

    expect(rows).toEqual([{ who: "sandbox_app", app: "card-auth-sandbox" }]);
    expect(pool.options.max).toBe(10);
  });

  test("app pool refuses a URL for any other role", async () => {
    const db = await migratedDatabase();
    expect(() => createAppPool(db.url)).toThrow(/sandbox_app/);
  });
});
