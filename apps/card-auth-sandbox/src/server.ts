import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createAppPool } from "./app-pool.ts";
import { monitorDatabase } from "./database-monitor.ts";

export interface SandboxOptions {
  readonly port: number;
  readonly databaseUrl: string;
  readonly host?: string;
}

export interface RunningSandbox {
  readonly port: number;
  close(): Promise<void>;
}

export async function startSandbox(options: SandboxOptions): Promise<RunningSandbox> {
  const pool = createAppPool(options.databaseUrl);
  const monitor = monitorDatabase(pool);

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
    async close() {
      monitor.stop();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await pool.end();
    },
  };
}
