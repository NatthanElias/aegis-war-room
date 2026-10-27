import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { type Acquirers, createAcquirers } from "./acquirers.ts";
import { createAppPool } from "./app-pool.ts";
import { type Authorization, authorize } from "./authorize.ts";
import { monitorDatabase } from "./database-monitor.ts";
import type { AcquirerName } from "./routing.ts";
import { createTelemetry } from "./telemetry.ts";

export interface SandboxOptions {
  readonly port: number;
  readonly databaseUrl: string;
  readonly host?: string;
  /** Replaces the simulated acquirers; tests use it to spy on calls or make an acquirer fail. */
  readonly acquirers?: Acquirers;
}

export interface RunningSandbox {
  readonly port: number;
  /** The app pool, exposed so tests can read its counters. */
  readonly pool: Pool;
  authorize(pan: string, amountCents: number): Promise<Authorization>;
  /** In-process fault: adds `ms` to every later call of `acquirer`. There is no HTTP route for it (US-03). */
  setAcquirerDelay(acquirer: AcquirerName, ms: number): void;
  close(): Promise<void>;
}

export async function startSandbox(options: SandboxOptions): Promise<RunningSandbox> {
  const pool = createAppPool(options.databaseUrl);
  const monitor = monitorDatabase(pool);
  const acquirers = options.acquirers ?? createAcquirers();
  const telemetry = createTelemetry();
  const shutdown = new AbortController();
  const context = { pool, acquirers, telemetry, signal: shutdown.signal };

  const server: Server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(monitor.ready ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: monitor.ready ? "ok" : "starting" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));

  return {
    port: (server.address() as AddressInfo).port,
    pool,
    authorize: (pan, amountCents) => authorize(context, { pan, amountCents }),
    setAcquirerDelay: (acquirer, ms) => acquirers.setDelay(acquirer, ms),
    async close() {
      monitor.stop();
      // Why: aborting lets authorizations that wait on a slow acquirer roll back, so pool.end() does not wait for them.
      shutdown.abort();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}
