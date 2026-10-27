import type { Pool } from "pg";

export interface DatabaseMonitor {
  readonly ready: boolean;
  stop(): void;
}

/**
 * Pings the pool every `intervalMs` (first ping at once) and keeps the latest outcome in `ready`.
 * A database that is down or comes back needs no restart: the next ping decides.
 * Hazard: the ping uses a pool connection, so a saturated pool reports not ready until a connection frees.
 */
export function monitorDatabase(
  pool: Pool,
  intervalMs = 1000,
  pingTimeoutMs = 2000,
): DatabaseMonitor {
  let ready = false;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;

  const ping = async () => {
    let timeout: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        pool.query("SELECT 1"),
        new Promise((_, reject) => {
          timeout = setTimeout(() => reject(new Error("ping timed out")), pingTimeoutMs);
        }),
      ]);
      ready = true;
    } catch {
      ready = false;
    } finally {
      clearTimeout(timeout);
    }
    if (!stopped) timer = setTimeout(ping, intervalMs);
  };
  void ping();

  return {
    get ready() {
      return ready;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
