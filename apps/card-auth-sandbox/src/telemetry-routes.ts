import type { Pool } from "pg";
import type { AcquirerName } from "./routing.ts";
import type { Telemetry } from "./telemetry.ts";
import { listAuthorizations, reportAcquirers, reportPool } from "./telemetry-report.ts";

export interface TelemetryResponse {
  readonly status: 200 | 400;
  readonly body: unknown;
}

const DEFAULT_WINDOW_SEC = 60;
const MAX_WINDOW_SEC = 300;
const MAX_SPAN_MS = 3600_000;
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;
const ISO_8601 = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2}))?$/;

const bad = (error: string): TelemetryResponse => ({ status: 400, body: { error } });

/** A whole number written in digits only, so `1.5`, `abc`, and an empty value are all refused. */
function parseInteger(raw: string): number | undefined {
  return /^\d+$/.test(raw) ? Number(raw) : undefined;
}

/**
 * An ISO 8601 date (read as UTC midnight) or a date-time with an explicit zone, such as `2026-10-27T15:00:00Z`.
 * Why: `Date.parse` alone also accepts forms like `Oct 27 2026` and `2026/10/27`, and a date-time without a
 * zone would depend on the server's local time.
 */
function parseInstant(raw: string | null): number | undefined {
  if (raw === null || !ISO_8601.test(raw)) return undefined;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Answers `GET /telemetry/*` from the in-process window and the pool's live counters, or returns
 * undefined for any other path.
 * Hazard: this must never query PostgreSQL. When the app pool is saturated it is the only way to see why
 * (sandbox-telemetry-off-pool).
 */
export function answerTelemetry(
  url: URL,
  telemetry: Telemetry,
  pool: Pool,
): TelemetryResponse | undefined {
  const params = url.searchParams;

  if (url.pathname === "/telemetry/acquirers") {
    const raw = params.get("windowSec");
    const windowSec = raw === null ? DEFAULT_WINDOW_SEC : parseInteger(raw);
    if (windowSec === undefined || windowSec < 1 || windowSec > MAX_WINDOW_SEC) {
      return bad("invalid_window");
    }
    return { status: 200, body: reportAcquirers(telemetry, windowSec) };
  }

  if (url.pathname === "/telemetry/authorizations") {
    const sinceMs = parseInstant(params.get("since"));
    const untilMs = parseInstant(params.get("until"));
    if (
      sinceMs === undefined ||
      untilMs === undefined ||
      sinceMs > untilMs ||
      untilMs - sinceMs > MAX_SPAN_MS
    ) {
      return bad("invalid_range");
    }
    const acquirer = params.get("acquirer");
    if (acquirer !== null && acquirer !== "acquirer-alpha" && acquirer !== "acquirer-beta") {
      return bad("invalid_acquirer");
    }
    const rawLimit = params.get("limit");
    const limit = rawLimit === null ? DEFAULT_LIMIT : parseInteger(rawLimit);
    if (limit === undefined || limit < 1 || limit > MAX_LIMIT) return bad("invalid_limit");
    return {
      status: 200,
      body: listAuthorizations(telemetry, {
        sinceMs,
        untilMs,
        acquirer: (acquirer as AcquirerName | null) ?? undefined,
        limit,
      }),
    };
  }

  if (url.pathname === "/telemetry/pool") return { status: 200, body: reportPool(pool) };
  return undefined;
}
