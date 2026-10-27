import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { monitorDatabase } from "./database-monitor.ts";
import { createDiagPool } from "./diag-pool.ts";
import { openIncidentStore } from "./incident-store.ts";

export interface ServerOptions {
  readonly port: number;
  readonly host?: string;
  readonly incidentId: string;
  readonly incidentsDir: string;
  /** The `warroom_diag` URL. Tests that need no database leave it out and `/healthz` then reports ok. */
  readonly databaseUrl?: string;
}

export interface RunningServer {
  readonly port: number;
  readonly incidentId: string;
  readonly conversationId: number;
  close(): Promise<void>;
}

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const store = await openIncidentStore(options.incidentsDir, options.incidentId);
  const pool = options.databaseUrl ? createDiagPool(options.databaseUrl) : undefined;
  const monitor = pool ? monitorDatabase(pool) : undefined;

  const server: Server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/healthz") {
      const ready = monitor?.ready ?? true;
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: ready ? "ok" : "starting" }));
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));

  return {
    port: (server.address() as AddressInfo).port,
    incidentId: options.incidentId,
    conversationId: store.conversationId,
    async close() {
      monitor?.stop();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await pool?.end();
      await store.close();
    },
  };
}
