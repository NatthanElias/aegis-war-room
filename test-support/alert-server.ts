import { createHmac } from "node:crypto";
import type { Alert } from "@warroom/contracts";
import type { AlertSettings } from "../apps/warroom-server/src/alerts/index.ts";
import { type RunningServer, startServer } from "../apps/warroom-server/src/server.ts";
import { makeTempIncidents, type TempIncidents } from "./incident-server.ts";

export const ALERT_TOKEN = "test-token";
export const HMAC_SECRET = "test-secret";

/** One alert as Grafana's webhook sends it; only the fields the adapter reads are required. */
export function grafanaAlert(
  fingerprint: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status: "firing",
    fingerprint,
    startsAt: "2026-10-28T12:00:00Z",
    labels: { alertname: `Alert ${fingerprint}`, severity: "critical" },
    annotations: { summary: `Summary of ${fingerprint}` },
    generatorURL: "https://grafana.example/alerting/rule/edit",
    ...overrides,
  };
}

export const grafanaBody = (...alerts: Array<Record<string, unknown>>) => ({ alerts });

/** The signature Grafana's documentation describes: hex HMAC-SHA256 over `timestamp`, a colon and the raw body. */
export function sign(secret: string, timestamp: string, rawBody: string | Buffer): string {
  return createHmac("sha256", secret).update(`${timestamp}:`).update(rawBody).digest("hex");
}

export interface PostOptions {
  /** Replaces the default `Bearer test-token`; `null` sends no `Authorization` header. */
  readonly authorization?: string | null;
  readonly headers?: Record<string, string>;
  readonly path?: string;
  readonly method?: string;
}

export interface WebhookResponse {
  readonly status: number;
  readonly body: unknown;
  readonly headers: Headers;
}

export interface AlertTestServer {
  readonly incidents: TempIncidents;
  readonly server: RunningServer;
  /** Sends `body` as JSON, or as it is when it is a string, to the webhook. */
  post(body: unknown, options?: PostOptions): Promise<WebhookResponse>;
  /** The committed alerts, read from the running server's store. */
  alerts(): Promise<Readonly<Record<string, Alert>>>;
  close(): Promise<void>;
}

/** Starts a server on a temporary incident folder with the webhook token `test-token` unless `settings` says otherwise. */
export async function startAlertServer(
  settings: AlertSettings = { token: ALERT_TOKEN },
  incidents?: TempIncidents,
): Promise<AlertTestServer> {
  const folder = incidents ?? (await makeTempIncidents());
  const server = await startServer({ ...folder.serverOptions(), alerts: settings });
  const post: AlertTestServer["post"] = async (body, options = {}) => {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (options.authorization !== null) {
      headers.authorization = options.authorization ?? `Bearer ${ALERT_TOKEN}`;
    }
    const response = await fetch(
      `http://127.0.0.1:${server.port}${options.path ?? "/alerts/grafana"}`,
      {
        method: options.method ?? "POST",
        headers: { ...headers, ...options.headers },
        body:
          options.method === "GET" || options.method === "DELETE"
            ? undefined
            : typeof body === "string"
              ? body
              : JSON.stringify(body),
      },
    );
    const text = await response.text();
    return {
      status: response.status,
      body: text === "" ? undefined : JSON.parse(text),
      headers: response.headers,
    };
  };
  return {
    incidents: folder,
    server,
    post,
    async alerts() {
      return (await server.store.readIncident()).alerts;
    },
    async close() {
      await server.close();
      if (incidents === undefined) await folder.remove();
    },
  };
}
