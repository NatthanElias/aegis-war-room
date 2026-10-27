import pg from "pg";

export const APP_ROLE = "sandbox_app";
export const APP_NAME = "card-auth-sandbox";
export const APP_POOL_MAX = 10;

/**
 * The pool live card traffic uses. It always connects as `sandbox_app`.
 * Hazard: runtime services must never hold the migrator's superuser credentials, so a URL for any other role is refused.
 */
export function createAppPool(connectionString: string): pg.Pool {
  const user = decodeURIComponent(new URL(connectionString).username);
  if (user !== APP_ROLE)
    throw new Error(`card-auth-sandbox must connect as ${APP_ROLE}, not ${user}`);
  const pool = new pg.Pool({ connectionString, max: APP_POOL_MAX, application_name: APP_NAME });
  // Why: an idle client that loses its connection emits `error` on the pool; unhandled, it would kill the process.
  pool.on("error", (error) => console.error(`app pool: ${error.message}`));
  return pool;
}
