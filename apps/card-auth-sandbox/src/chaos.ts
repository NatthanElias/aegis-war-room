import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { Acquirers } from "./acquirers.ts";

/** The named faults the presenter can start. Later scenarios (US-11, US-15) add values here. */
export type ChaosScenario = "none" | "cascade-decoy";

/** The extra delay `cascade-decoy` adds to every `acquirer-beta` call. */
export const CASCADE_DECOY_DELAY_MS = 8000;

/** The port compose and the presenter command use when nothing else is configured. */
export const DEFAULT_CHAOS_PORT = 4001;

const MAX_BODY_BYTES = 1024;

/** The one line the presenter command prints for `scenario`. */
export function describeScenario(scenario: ChaosScenario): string {
  return scenario === "none"
    ? "chaos: none"
    : `chaos: ${scenario} (acquirer-beta +${CASCADE_DECOY_DELAY_MS} ms per call)`;
}

/** `CHAOS_PORT`: undefined (no control listener) when unset or empty; a bad value fails at startup like `TRAFFIC_RATE`. */
export function resolveChaosPort(env: Record<string, string | undefined>): number | undefined {
  const raw = env.CHAOS_PORT;
  if (raw === undefined || raw === "") return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error(`CHAOS_PORT must be an integer from 1 to 65535, got "${raw}"`);
  }
  return value;
}

/** The scenario a `PUT` body or an answer names, or undefined when the text is not JSON or names anything else. */
export function parseScenario(text: string): ChaosScenario | undefined {
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return undefined;
  }
  if (typeof body !== "object" || body === null) return undefined;
  const scenario = (body as { scenario?: unknown }).scenario;
  return scenario === "none" || scenario === "cascade-decoy" ? scenario : undefined;
}

/** The request body as text, or undefined when it is larger than any valid body. */
function readBody(request: IncomingMessage): Promise<string | undefined> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    request.on("end", () =>
      resolve(size > MAX_BODY_BYTES ? undefined : Buffer.concat(chunks).toString("utf8")),
    );
  });
}

export interface ChaosControl {
  readonly port: number;
  close(): Promise<void>;
}

/**
 * Starts the control listener on loopback and keeps the scenario in this process, beginning at `none`.
 * Hazard: bind `127.0.0.1` only. warroom-server and the investigators reach the sandbox's public port, so a
 * wider bind would let the war room read or end the fault (chaos-presenter-only).
 */
export async function startChaosControl(
  port: number,
  acquirers: Pick<Acquirers, "setDelay">,
): Promise<ChaosControl> {
  let scenario: ChaosScenario = "none";

  const answer = (response: ServerResponse, status: number, body: Record<string, string>) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(JSON.stringify(body));
  };

  const server = createServer((request, response) => {
    if (request.url !== "/chaos/scenario") {
      response.writeHead(404).end();
      return;
    }
    if (request.method === "GET") {
      answer(response, 200, { scenario });
      return;
    }
    if (request.method !== "PUT") {
      response.writeHead(404).end();
      return;
    }
    void readBody(request).then((text) => {
      const requested = text === undefined ? undefined : parseScenario(text);
      if (requested === undefined) {
        answer(response, 400, { error: "invalid_scenario" });
        return;
      }
      acquirers.setDelay(
        "acquirer-beta",
        requested === "cascade-decoy" ? CASCADE_DECOY_DELAY_MS : 0,
      );
      scenario = requested;
      console.log(`card-auth-sandbox: chaos scenario ${scenario}`);
      answer(response, 200, { scenario });
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  return {
    port: (server.address() as AddressInfo).port,
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
