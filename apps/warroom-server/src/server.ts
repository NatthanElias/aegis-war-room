import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { fileURLToPath } from "node:url";
import { acceptWebSockets, createHost, type Host } from "@earendil-works/chord";
import type { Models } from "@earendil-works/pi-ai/models";
import type { Registry } from "@earendil-works/pi-durable";
import {
  type Principal,
  principalKey,
  resolveSeededUser,
  SERVER_PRINCIPAL,
} from "@warroom/contracts";
import { WebSocketServer } from "ws";
import { createAgentRegistry } from "./agents/index.ts";
import { monitorDatabase } from "./database-monitor.ts";
import { createDiagPool } from "./diag-pool.ts";
import { serveIncident, serveIncidentMirror } from "./incident.ts";
import { openIncidentStore } from "./incident-store.ts";
import { probeSandbox, serveRuntime } from "./runtime.ts";
import { serveShell } from "./shell.ts";
import { serveStatic } from "./static-files.ts";

export interface ServerOptions {
  readonly port: number;
  readonly host?: string;
  readonly incidentId: string;
  readonly incidentsDir: string;
  /** Where the sandbox answers `GET /healthz`. */
  readonly sandboxUrl: string;
  /** Milliseconds between sandbox polls; the shell shows a change within one poll plus one request. */
  readonly sandboxPollMs?: number;
  /** The built web bundle. */
  readonly webDist?: string;
  /** The `warroom_diag` URL. Tests that need no database leave it out and `/healthz` then reports ok. */
  readonly databaseUrl?: string;
  /** Replaces the default agent registry and model catalog; without it the two stub agents run with no model provider. */
  readonly agents?: { readonly registry?: Registry; readonly models?: Models };
}

export interface RunningServer {
  readonly port: number;
  readonly incidentId: string;
  readonly conversationId: number;
  /** The Chord host, so tests can act as the server's own principal. */
  readonly chord: Host<Principal>;
  close(): Promise<void>;
}

const DEFAULT_WEB_DIST = fileURLToPath(new URL("../../web/dist", import.meta.url));

export async function startServer(options: ServerOptions): Promise<RunningServer> {
  const store = await openIncidentStore(options.incidentsDir, options.incidentId, {
    registry: options.agents?.registry ?? createAgentRegistry(),
    models: options.agents?.models,
  });
  const pool = options.databaseUrl ? createDiagPool(options.databaseUrl) : undefined;
  const monitor = pool ? monitorDatabase(pool) : undefined;

  const chord = createHost<Principal>({ name: "server", self: SERVER_PRINCIPAL, principalKey });
  serveRuntime(chord, {
    incidentId: options.incidentId,
    conversationId: store.conversationId,
    sandboxUrl: options.sandboxUrl,
    sandboxPollMs: options.sandboxPollMs ?? 2000,
    initialSandbox: await probeSandbox(options.sandboxUrl, new AbortController().signal),
  });
  serveShell(chord);
  serveIncidentMirror(chord, await store.watchIncident());
  serveIncident(chord, store);
  await chord.ready();

  const webDist = options.webDist ?? DEFAULT_WEB_DIST;
  const server: Server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (request.method === "GET" && url.pathname === "/healthz") {
      const ready = monitor?.ready ?? true;
      response.writeHead(ready ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: ready ? "ok" : "starting" }));
      return;
    }
    if (request.method === "GET") {
      void serveStatic(webDist, url.pathname, response);
      return;
    }
    response.writeHead(404).end();
  });

  // Context: `noServer` lets the HTTP server own the port and hand only `/chord` upgrades to Chord.
  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (request, socket, head) => {
    if (new URL(request.url ?? "/", "http://localhost").pathname !== "/chord") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => wss.emit("connection", ws, request));
  });
  // Hazard: this is the only place identity is decided. An unknown or missing `user` gives no principal,
  // and Chord then closes the socket before sending any state.
  acceptWebSockets(wss, chord, {
    principal: (request) =>
      resolveSeededUser(new URL(request.url ?? "/", "http://localhost").searchParams.get("user")),
  });

  await new Promise<void>((resolve) => server.listen(options.port, options.host, resolve));

  return {
    port: (server.address() as AddressInfo).port,
    incidentId: options.incidentId,
    conversationId: store.conversationId,
    chord,
    async close() {
      monitor?.stop();
      for (const client of wss.clients) client.terminate();
      wss.close();
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await chord.close();
      await pool?.end();
      await store.close();
    },
  };
}
