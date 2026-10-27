import { randomBytes } from "node:crypto";
import pg from "pg";

/** The test PostgreSQL the builder starts once; see `.specs/features/walking-skeleton/checks.md`. */
export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://postgres:warroom@127.0.0.1:55432/postgres";

export interface TestDatabase {
  readonly name: string;
  /** Superuser URL of the throwaway database. */
  readonly url: string;
  /** URL of the same database for one of the fixed local roles. */
  roleUrl(role: "sandbox_app" | "warroom_diag" | "sandbox_admin"): string;
  drop(): Promise<void>;
}

function urlFor(base: string, database: string, user?: string): string {
  const url = new URL(base);
  url.pathname = `/${database}`;
  if (user) {
    url.username = user;
    // Context: 0001_roles.sql gives each local role its own name as password.
    url.password = user;
  }
  return url.toString();
}

/** Creates `wr_test_{random}` so no two test files share tables. Fails, never skips, when the server is down. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const admin = new pg.Client({ connectionString: TEST_DATABASE_URL });
  admin.on("error", () => undefined);
  try {
    await admin.connect();
  } catch (error) {
    throw new Error(`TEST_DATABASE_URL unreachable (${TEST_DATABASE_URL}): ${String(error)}`);
  }
  const name = `wr_test_${randomBytes(6).toString("hex")}`;
  try {
    await admin.query(`CREATE DATABASE ${name}`);
  } finally {
    await admin.end();
  }
  return {
    name,
    url: urlFor(TEST_DATABASE_URL, name),
    roleUrl: (role) => urlFor(TEST_DATABASE_URL, name, role),
    async drop() {
      const dropper = new pg.Client({ connectionString: TEST_DATABASE_URL });
      dropper.on("error", () => undefined);
      await dropper.connect();
      try {
        await dropper.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      } finally {
        await dropper.end();
      }
    },
  };
}
