import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { IncidentStore } from "../incident-store.ts";
import { type Adapter, InvalidAlertError } from "./adapter.ts";
import { createGrafanaAdapter } from "./grafana.ts";
import { createRateLimiter } from "./rate-limit.ts";
import { type AlertEntry, applyAlerts } from "./record.ts";

export type { AlertEntry } from "./record.ts";

/** Largest accepted request body, in bytes. */
export const MAX_BODY_BYTES = 262_144;
const DEFAULT_RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60_000;

export interface AlertSettings {
  /** The shared bearer token. Unset or empty disables the webhooks (`503`). */
  readonly token?: string;
  /** Turns on the Grafana signature check when set. */
  readonly hmacSecret?: string;
  /** New alerts allowed per sliding 60 s across all sources; default 30. */
  readonly rateLimit?: number;
  /** The clock in epoch milliseconds; tests move it instead of sleeping. */
  readonly now?: () => number;
}

export type AlertHandler = (
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
) => Promise<void>;

/** Thrown inside the commit to roll it back and answer `429`. */
class RateLimited extends Error {
  readonly retryAfter: number;

  constructor(retryAfter: number) {
    super("rate_limited");
    this.retryAfter = retryAfter;
  }
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

/** The token from `Authorization: Bearer <token>`, or `undefined` for any other scheme or a missing header. */
function bearerToken(request: IncomingMessage): string | undefined {
  return /^bearer +(.+)$/i.exec(request.headers.authorization ?? "")?.[1];
}

/**
 * Compares two secrets without leaking how much of them matches.
 * Hazard: hashing first gives `timingSafeEqual` equal-length inputs, so the length of the real token does not leak.
 */
function sameSecret(given: string, expected: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(given), digest(expected));
}

/** Reads the body up to `MAX_BODY_BYTES`; `undefined` means it was larger. */
function readBody(request: IncomingMessage): Promise<Buffer | undefined> {
  return new Promise((resolve, reject) => {
    const declared = Number(request.headers["content-length"]);
    if (declared > MAX_BODY_BYTES) {
      resolve(undefined);
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      // Why: stop buffering at the limit so a large upload cannot use the server's memory.
      if (size > MAX_BODY_BYTES) {
        chunks.length = 0;
        resolve(undefined);
      } else if (size <= MAX_BODY_BYTES) {
        chunks.push(chunk);
      }
    });
    request.on("end", () => resolve(Buffer.concat(chunks)));
    request.on("error", reject);
  });
}

/**
 * Serves every `/alerts/...` request: checks run in a fixed order and nothing is parsed or stored until the
 * caller is authenticated.
 */
export function createAlertHandler(
  settings: AlertSettings,
  store: Pick<IncidentStore, "commitIncident">,
): AlertHandler {
  const now = settings.now ?? Date.now;
  const limiter = createRateLimiter({
    limit: settings.rateLimit ?? DEFAULT_RATE_LIMIT,
    windowMs: RATE_WINDOW_MS,
    now,
  });
  // Context: a new source is one adapter file and one entry here.
  const adapters = new Map<string, Adapter>([
    ["grafana", createGrafanaAdapter({ hmacSecret: settings.hmacSecret || undefined })],
  ]);

  return async (request, response, pathname) => {
    if (!settings.token) {
      sendJson(response, 503, { error: "alerts_disabled" });
      return;
    }
    if (request.method !== "POST") {
      sendJson(response, 405, { error: "method_not_allowed" }, { allow: "POST" });
      return;
    }
    const source = pathname.slice("/alerts/".length);
    const adapter = adapters.get(source);
    if (!pathname.startsWith("/alerts/") || adapter === undefined) {
      sendJson(response, 404, { error: "unknown_source" });
      return;
    }
    const unauthorized = (reason: string) => {
      // Why: the answer is the same for every cause so a caller learns nothing; the log says which check failed.
      console.warn(`alerts: refused a ${source} request: ${reason}`);
      sendJson(response, 401, { error: "unauthorized" }, { "www-authenticate": "Bearer" });
    };
    const token = bearerToken(request);
    if (token === undefined) return unauthorized("missing_token");
    if (!sameSecret(token, settings.token)) return unauthorized("bad_token");

    const mediaType = (request.headers["content-type"] ?? "").split(";")[0]?.trim().toLowerCase();
    if (mediaType !== "application/json") {
      sendJson(response, 415, { error: "unsupported_media_type" });
      return;
    }
    const rawBody = await readBody(request);
    if (rawBody === undefined) {
      sendJson(response, 413, { error: "payload_too_large" }, { connection: "close" });
      return;
    }
    const failure = adapter.verify?.({ headers: request.headers, rawBody, nowMs: now() });
    if (failure !== undefined) return unauthorized(failure);

    let alerts: ReturnType<Adapter["parse"]>;
    try {
      alerts = adapter.parse(JSON.parse(rawBody.toString("utf8")));
    } catch (error) {
      const detail =
        error instanceof InvalidAlertError ? error.detail : "/ the body is not valid JSON";
      sendJson(response, 400, { error: "invalid_alert", detail });
      return;
    }

    let entries: AlertEntry[];
    try {
      entries = await store.commitIncident((doc) => {
        const applied = applyAlerts(doc, alerts, new Date(now()).toISOString());
        // Why: the check runs inside the commit, after matching, so only alerts that really get a new ID count
        // and a rejected request rolls back with nothing written.
        const retryAfter = limiter.retryAfter(applied.newCount);
        if (retryAfter !== undefined) throw new RateLimited(retryAfter);
        limiter.record(applied.newCount);
        return applied.entries;
      });
    } catch (error) {
      if (error instanceof RateLimited) {
        sendJson(
          response,
          429,
          { error: "rate_limited" },
          { "retry-after": String(error.retryAfter) },
        );
        return;
      }
      throw error;
    }
    const accepted = entries.some((entry) => entry.status === "accepted");
    sendJson(response, accepted ? 202 : 200, { alerts: entries });
  };
}
