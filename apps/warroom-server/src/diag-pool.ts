import pg from "pg";

export const DIAG_ROLE = "warroom_diag";
export const DIAG_NAME = "warroom-diag";
export const DIAG_POOL_MAX = 2;

/**
 * The read-only pool investigators use to inspect PostgreSQL. It always connects as `warroom_diag`.
 * Hazard: the session options are what keep this pool read-only and short-lived; dropping one lets a
 * diagnostic query block behind application locks or write data.
 */
export function createDiagPool(connectionString: string): pg.Pool {
  const user = decodeURIComponent(new URL(connectionString).username);
  if (user !== DIAG_ROLE)
    throw new Error(`warroom-server must connect as ${DIAG_ROLE}, not ${user}`);
  const pool = new pg.Pool({
    connectionString,
    max: DIAG_POOL_MAX,
    application_name: DIAG_NAME,
    connectionTimeoutMillis: 2000,
    options: "-c statement_timeout=2s -c lock_timeout=500ms -c default_transaction_read_only=on",
  });
  // Why: an idle client that loses its connection emits `error` on the pool; unhandled, it would kill the process.
  pool.on("error", (error) => console.error(`diag pool: ${error.message}`));
  return pool;
}
