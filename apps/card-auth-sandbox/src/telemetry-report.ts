import type {
  SandboxAcquirerTelemetry,
  SandboxAuthorizationList,
  SandboxPoolTelemetry,
} from "@warroom/contracts";
import { APP_POOL_MAX } from "./app-pool.ts";
import type { AcquirerName } from "./routing.ts";
import type { Telemetry, TelemetryEntry } from "./telemetry.ts";

/** Nearest-rank percentile of an ascending list; `fraction` is 0.5 for the median. */
function percentile(sorted: readonly number[], fraction: number): number {
  const rank = Math.ceil(fraction * sorted.length);
  return sorted[Math.max(rank - 1, 0)] as number;
}

const latencyOf = (entry: TelemetryEntry): number =>
  (entry.decidedAtMs as number) - entry.startedAtMs;

/**
 * Counts and latency per acquirer over authorizations started in the last `windowSec`.
 * Context: an authorization that started before the window is left out even while it is still in flight.
 */
export function reportAcquirers(
  telemetry: Telemetry,
  windowSec: number,
  nowMs: number = Date.now(),
): SandboxAcquirerTelemetry {
  const cutoff = nowMs - windowSec * 1000;
  const inWindow = telemetry.entries().filter((entry) => entry.startedAtMs >= cutoff);

  const summarize = (
    acquirer: AcquirerName,
  ): SandboxAcquirerTelemetry["acquirers"][AcquirerName] => {
    const entries = inWindow.filter((entry) => entry.acquirer === acquirer);
    const pending = entries.filter((entry) => entry.status === "PENDING");
    const latencies = entries
      .filter((entry) => entry.status !== "PENDING")
      .map(latencyOf)
      .sort((a, b) => a - b);
    return {
      approved: entries.filter((entry) => entry.status === "APPROVED").length,
      declined: entries.filter((entry) => entry.status === "DECLINED").length,
      errors: entries.filter((entry) => entry.status === "ERROR").length,
      inFlight: pending.length,
      // Entries are in start order, so the first pending one is the oldest.
      oldestInFlightMs: pending[0] ? nowMs - pending[0].startedAtMs : null,
      latencyMs:
        latencies.length === 0
          ? null
          : {
              p50: percentile(latencies, 0.5),
              p95: percentile(latencies, 0.95),
              max: latencies[latencies.length - 1] as number,
            },
    };
  };

  return {
    windowSec,
    generatedAt: new Date(nowMs).toISOString(),
    dropped: telemetry.dropped,
    acquirers: {
      "acquirer-alpha": summarize("acquirer-alpha"),
      "acquirer-beta": summarize("acquirer-beta"),
    },
  };
}

export interface AuthorizationQuery {
  readonly sinceMs: number;
  readonly untilMs: number;
  readonly acquirer?: AcquirerName;
  readonly limit: number;
}

/** Authorizations started between `sinceMs` and `untilMs` inclusive, newest first, at most `limit`. */
export function listAuthorizations(
  telemetry: Telemetry,
  query: AuthorizationQuery,
): SandboxAuthorizationList {
  const matches = telemetry
    .entries()
    .filter(
      (entry) =>
        entry.startedAtMs >= query.sinceMs &&
        entry.startedAtMs <= query.untilMs &&
        (query.acquirer === undefined || entry.acquirer === query.acquirer),
    )
    .reverse()
    .slice(0, query.limit);
  return {
    since: new Date(query.sinceMs).toISOString(),
    until: new Date(query.untilMs).toISOString(),
    authorizations: matches.map((entry) => ({
      traceId: entry.traceId,
      brand: entry.brand,
      acquirer: entry.acquirer,
      bin: entry.bin,
      last4: entry.last4,
      amountCents: entry.amountCents,
      status: entry.status,
      startedAt: new Date(entry.startedAtMs).toISOString(),
      decidedAt: entry.decidedAtMs === null ? null : new Date(entry.decidedAtMs).toISOString(),
      latencyMs: entry.decidedAtMs === null ? null : latencyOf(entry),
    })),
  };
}

export function reportPool(pool: {
  readonly totalCount: number;
  readonly idleCount: number;
  readonly waitingCount: number;
}): SandboxPoolTelemetry {
  return {
    max: APP_POOL_MAX as 10,
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
  };
}
