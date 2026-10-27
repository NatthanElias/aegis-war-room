import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createTestDatabase, type TestDatabase } from "../../../test-support/database.ts";
import { runNode } from "../../../test-support/process.ts";
import { runMigrations } from "../src/migrations.ts";

// Why: readdir order is filesystem-dependent, so this hands back every listing reversed to make an unsorted run visible.
vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...original,
    readdir: async (...args: Parameters<typeof original.readdir>) =>
      (
        (await (original.readdir as (...a: unknown[]) => Promise<string[]>)(...args)) as string[]
      ).reverse(),
  };
});

const migrationsDir = fileURLToPath(new URL("../migrations", import.meta.url));
const migrateScript = fileURLToPath(new URL("../src/migrate.ts", import.meta.url));

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

async function newDatabase(): Promise<TestDatabase> {
  const db = await createTestDatabase();
  cleanups.push(() => db.drop());
  return db;
}

async function newClient(url: string): Promise<pg.Client> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  cleanups.push(() => client.end());
  return client;
}

async function tempMigrations(files: Record<string, string>): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wr-migrations-"));
  cleanups.push(() => rm(dir, { recursive: true, force: true }));
  for (const [name, sql] of Object.entries(files)) await writeFile(join(dir, name), sql);
  return dir;
}

const ledger = async (client: pg.Client) =>
  (await client.query("SELECT name FROM sandbox_migrations ORDER BY applied_at, name")).rows.map(
    (row) => row.name as string,
  );

describe("migrate", () => {
  test("applies pending files in name order and records each name", async () => {
    const db = await newDatabase();
    const client = await newClient(db.url);
    const roles = await readFile(join(migrationsDir, "0001_roles.sql"), "utf8");
    // Written out of name order so only sorting can produce the expected order.
    const dir = await tempMigrations({
      "0003_gadgets.sql": "CREATE TABLE gadgets (id int);",
      "0001_roles.sql": roles,
      "0002_widgets.sql": "CREATE TABLE widgets (id int);",
    });

    const result = await runMigrations(client, dir);

    expect(result.applied).toEqual(["0001_roles.sql", "0002_widgets.sql", "0003_gadgets.sql"]);
    expect(await ledger(client)).toEqual([
      "0001_roles.sql",
      "0002_widgets.sql",
      "0003_gadgets.sql",
    ]);
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('widgets','gadgets')",
    );
    expect(tables.rowCount).toBe(2);
  });

  test("applies pending files from the shipped folder, then a second run applies nothing", async () => {
    const db = await newDatabase();
    const client = await newClient(db.url);

    const first = await runMigrations(client, migrationsDir);
    expect(first.applied[0]).toBe("0001_roles.sql");
    const before = await client.query("SELECT count(*)::int AS n FROM sandbox_migrations");
    expect(before.rows[0].n).toBe(first.applied.length);

    const second = await runMigrations(client, migrationsDir);
    expect(second.applied).toEqual([]);
    const after = await client.query("SELECT count(*)::int AS n FROM sandbox_migrations");
    expect(after.rows[0].n).toBe(before.rows[0].n);
  });

  test("applies pending files until one fails: it rolls back alone and the run exits 1", async () => {
    const db = await newDatabase();
    const client = await newClient(db.url);
    const roles = await readFile(join(migrationsDir, "0001_roles.sql"), "utf8");
    const dir = await tempMigrations({
      "0001_roles.sql": roles,
      "0002_good.sql": "CREATE TABLE good (id int);",
      "0003_bad.sql": "CREATE TABLE half_done (id int); SELECT 1/0;",
      "0004_never.sql": "CREATE TABLE never_run (id int);",
    });

    const run = await runNode(migrateScript, { DATABASE_URL: db.url, MIGRATIONS_DIR: dir });

    expect(run.code).toBe(1);
    expect(run.stderr).toContain("0003_bad.sql");
    expect(await ledger(client)).toEqual(["0001_roles.sql", "0002_good.sql"]);
    const tables = await client.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name IN ('good','half_done','never_run')",
    );
    expect(tables.rows.map((row) => row.table_name)).toEqual(["good"]);
  });

  test("roles exist after migrate and warroom_diag reads all stats", async () => {
    const db = await newDatabase();
    const client = await newClient(db.url);
    await runMigrations(client, migrationsDir);

    const roles = await client.query(
      "SELECT rolname, rolcanlogin FROM pg_roles WHERE rolname IN ('sandbox_app','warroom_diag','sandbox_admin') ORDER BY rolname",
    );
    expect(roles.rows).toEqual([
      { rolname: "sandbox_admin", rolcanlogin: true },
      { rolname: "sandbox_app", rolcanlogin: true },
      { rolname: "warroom_diag", rolcanlogin: true },
    ]);
    const member = await client.query(
      "SELECT pg_has_role('warroom_diag', 'pg_read_all_stats', 'member') AS member",
    );
    expect(member.rows[0].member).toBe(true);
  });

  test("roles file grants pg_read_all_stats to warroom_diag even when the membership is gone", async () => {
    const db = await newDatabase();
    const client = await newClient(db.url);
    const roles = await readFile(join(migrationsDir, "0001_roles.sql"), "utf8");
    const isMember = async () =>
      (await client.query("SELECT pg_has_role('warroom_diag', 'pg_read_all_stats', 'member') AS m"))
        .rows[0].m;

    // Roles outlive the throwaway database, so the previous test run may have granted already.
    // Taking the same lock as the file keeps parallel test files from granting between the steps.
    await client.query("BEGIN");
    try {
      await client.query("LOCK TABLE pg_catalog.pg_authid IN SHARE ROW EXCLUSIVE MODE");
      await client.query(roles);
      await client.query("REVOKE pg_read_all_stats FROM warroom_diag");
      expect(await isMember()).toBe(false);

      await client.query(roles);

      expect(await isMember()).toBe(true);
    } finally {
      await client.query("COMMIT");
    }
  });

  test("roles file runs again in a second database of the same server", async () => {
    const first = await newDatabase();
    const second = await newDatabase();
    const roles = await readFile(join(migrationsDir, "0001_roles.sql"), "utf8");
    const firstClient = await newClient(first.url);
    await runMigrations(firstClient, migrationsDir);

    const secondClient = await newClient(second.url);
    await expect(secondClient.query(roles)).resolves.toBeDefined();

    const member = await secondClient.query(
      "SELECT pg_has_role('warroom_diag', 'pg_read_all_stats', 'member') AS member",
    );
    expect(member.rows[0].member).toBe(true);
  });
});
