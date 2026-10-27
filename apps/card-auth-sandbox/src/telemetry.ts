import type { AcquirerName, Brand } from "./routing.ts";

export type AuthorizationStatus = "PENDING" | "APPROVED" | "DECLINED" | "ERROR";

/** How long, and how many, finished and in-flight authorizations the window keeps. */
export const WINDOW_MS = 300_000;
export const MAX_ENTRIES = 10_000;

export interface TelemetryEntry {
  readonly traceId: string;
  readonly brand: Brand;
  readonly acquirer: AcquirerName;
  readonly bin: string;
  readonly last4: string;
  readonly amountCents: number;
  readonly startedAtMs: number;
  status: AuthorizationStatus;
  decidedAtMs: number | null;
}

export type NewEntry = Omit<TelemetryEntry, "startedAtMs" | "status" | "decidedAtMs">;

export interface Telemetry {
  /** Records an authorization as `PENDING`. */
  begin(entry: NewEntry): TelemetryEntry;
  /** Moves a `PENDING` entry to its final status. A second call for the same entry is ignored. */
  finish(entry: TelemetryEntry, status: Exclude<AuthorizationStatus, "PENDING">): void;
  /** Authorizations not finished yet, kept even if their entry already left the window. */
  readonly inFlight: number;
  /** Ticks the traffic generator skipped because 50 authorizations were in flight, since start. */
  readonly dropped: number;
  recordDropped(): void;
  /** Entries still inside the window, oldest first. */
  entries(): TelemetryEntry[];
}

/**
 * The rolling window behind the telemetry routes: in process memory, never read from PostgreSQL.
 * Hazard: telemetry must not query through the app pool. It matters most when that pool is saturated.
 */
export function createTelemetry(now: () => number = Date.now): Telemetry {
  // Why: a Map keeps insertion order, which is start order, so the oldest entry is always first.
  const window = new Map<string, TelemetryEntry>();
  let inFlight = 0;
  let dropped = 0;

  const prune = () => {
    const cutoff = now() - WINDOW_MS;
    for (const [key, entry] of window) {
      if (window.size <= MAX_ENTRIES && entry.startedAtMs >= cutoff) break;
      window.delete(key);
    }
  };

  return {
    begin(entry) {
      const created: TelemetryEntry = {
        ...entry,
        startedAtMs: now(),
        status: "PENDING",
        decidedAtMs: null,
      };
      window.set(created.traceId, created);
      inFlight++;
      prune();
      return created;
    },
    finish(entry, status) {
      if (entry.status !== "PENDING") return;
      entry.status = status;
      entry.decidedAtMs = now();
      inFlight--;
    },
    get inFlight() {
      return inFlight;
    },
    get dropped() {
      return dropped;
    },
    recordDropped() {
      dropped++;
    },
    entries() {
      prune();
      return [...window.values()];
    },
  };
}
