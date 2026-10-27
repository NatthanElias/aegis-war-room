import { fileURLToPath } from "node:url";
import { connectWithRetry, resolveMigrateTimeoutMs, runMigrations } from "./migrations.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("migrate: DATABASE_URL is required");
  process.exit(1);
}
const dir = process.env.MIGRATIONS_DIR ?? fileURLToPath(new URL("../migrations", import.meta.url));

try {
  const client = await connectWithRetry(databaseUrl, resolveMigrateTimeoutMs(process.env), (m) =>
    console.log(`migrate: ${m}`),
  );
  try {
    const { applied } = await runMigrations(client, dir);
    console.log(
      `migrate: applied ${applied.length} file(s)${applied.map((f) => ` ${f}`).join("")}`,
    );
  } finally {
    await client.end();
  }
} catch (error) {
  console.error(`migrate: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
