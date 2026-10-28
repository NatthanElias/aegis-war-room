import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Pool } from "pg";
import { type Acquirers, createAcquirers } from "./acquirers.ts";
import { createAppPool } from "./app-pool.ts";
import { type Authorization, authorize } from "./authorize.ts";
import { type ChaosControl, startChaosControl } from "./chaos.ts";
import { monitorDatabase } from "./database-monitor.ts";
import type { AcquirerName } from "./routing.ts";
import { createTelemetry } from "./telemetry.ts";
import { answerTelemetry } from "./telemetry-routes.ts";
import { startTraffic } from "./traffic.ts";

export interface SandboxOptions {
  readonly port: number;
  readonly databaseUrl: string;
  readonly host?: string;
  /** Replaces the simulated acquirers; tests use it to spy on calls or make an acquirer fail. */
  readonly acquirers?: Acquirers;
  /** Synthetic authorizations per second; 0 or unset generates none. */
  readonly trafficRate?: number;
  /** Port of the loopback-only chaos control listener; unset starts none, 0 picks a free port. */
  readonly chaosPort?: number;
}

export interface RunningSandbox {
  readonly port: number;
  /** The control listener's port, or undefined when `chaosPort` was not set. */
  readonly chaosPort: number | undefined;
  /** The app pool, exposed so tests can read its counters. */
  readonly pool: Pool;
  authorize(pan: string, amountCents: number): Promise<Authorization>;
  /** In-process fault: adds `ms` to every later call of `acquirer`. The public port has no route for it (US-03). */
  setAcquirerDelay(acquirer: AcquirerName, ms: number): void;
  close(): Promise<void>;
}

/** The request target as a URL, or a path no route matches when the target is malformed. */
function requestUrl(target: string | undefined): URL {
  try {
    return new URL(target ?? "/", "http://sandbox.invalid");
  } catch {
    return new URL("http://sandbox.invalid/");
  }
}

export async function startSandbox(options: SandboxOptions): Promise<RunningSandbox> {
  const pool = createAppPool(options.databaseUrl);
  const acquirers = options.acquirers ?? createAcquirers();
  let chaos: ChaosControl | undefined;
  if (options.chaosPort !== undefined) {
    try {
      chaos = await startChaosControl(options.chaosPort, acquirers);
    } catch (error) {
      await pool.end();
      throw error;
    }
  }
  const monitor = monitorDatabase(pool);
  const telemetry = createTelemetry();
  const shutdown = new AbortController();
  const context = { pool, acquirers, telemetry, signal: shutdown.signal };

  const server: Server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      response.writeHead(monitor.ready ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: monitor.ready ? "ok" : "starting" }));
      return;
    }
    if (request.method === "GET") {
      const answer = answerTelemetry(requestUrl(request.url), telemetry, pool);
      if (answer) {
        response.writeHead(answer.status, { "content-type": "application/json" });
        response.end(JSON.stringify(answer.body));
        return;
      }
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));
  const traffic = startTraffic({
    ratePerSec: options.trafficRate ?? 0,
    authorize: (pan, amountCents) => authorize(context, { pan, amountCents }),
    telemetry,
  });

  return {
    port: (server.address() as AddressInfo).port,
    chaosPort: chaos?.port,
    pool,
    authorize: (pan, amountCents) => authorize(context, { pan, amountCents }),
    setAcquirerDelay: (acquirer, ms) => acquirers.setDelay(acquirer, ms),
    async close() {
      monitor.stop();
      traffic.stop();
      // Why: aborting lets authorizations that wait on a slow acquirer roll back, so pool.end() does not wait for them.
      shutdown.abort();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await chaos?.close();
      await pool.end();
    },
  };
}
