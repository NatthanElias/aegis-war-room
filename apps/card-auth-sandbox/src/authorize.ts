import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import type { Acquirers, Decision } from "./acquirers.ts";
import { type AcquirerName, type Brand, routeBin, UNSUPPORTED_BIN } from "./routing.ts";
import type { Telemetry } from "./telemetry.ts";

export interface AuthorizeContext {
  readonly pool: Pool;
  readonly acquirers: Acquirers;
  readonly telemetry: Telemetry;
  /** Passed to the acquirer call; aborted on sandbox close. */
  readonly signal?: AbortSignal;
}

export interface Authorization {
  readonly traceId: string;
  readonly brand: Brand;
  readonly acquirer: AcquirerName;
  readonly bin: string;
  readonly last4: string;
  readonly amountCents: number;
  readonly status: Decision;
}

export type RejectionCode = "unsupported_bin" | "invalid_pan" | "invalid_amount";

/** A request refused before any database or acquirer work. */
export class AuthorizationRejected extends Error {
  readonly code: RejectionCode;

  constructor(code: RejectionCode) {
    super(code);
    this.name = "AuthorizationRejected";
    this.code = code;
  }
}

const MAX_AMOUNT_CENTS = 2_147_483_647;

/**
 * Authorizes one card payment: routes by BIN, writes a `PENDING` hold, asks the acquirer, then settles the hold.
 * Resolves with `APPROVED` or `DECLINED`. Rejects with `AuthorizationRejected` for a request that is refused up front,
 * and with the underlying error when the database or the acquirer fails; that case is recorded as `ERROR` in
 * telemetry and leaves no `card_holds` row.
 * Hazard: the full `pan` stays inside this call. Only its first 6 and last 4 digits go to the database and telemetry.
 */
export async function authorize(
  context: AuthorizeContext,
  request: { readonly pan: string; readonly amountCents: number },
): Promise<Authorization> {
  const { pan, amountCents } = request;
  const route = routeBin(pan);
  if (route === UNSUPPORTED_BIN) throw new AuthorizationRejected("unsupported_bin");
  if (!/^\d{13,19}$/.test(pan)) throw new AuthorizationRejected("invalid_pan");
  if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > MAX_AMOUNT_CENTS) {
    throw new AuthorizationRejected("invalid_amount");
  }

  const traceId = randomUUID();
  const bin = pan.slice(0, 6);
  const last4 = pan.slice(-4);
  const entry = context.telemetry.begin({ traceId, ...route, bin, last4, amountCents });

  let client: PoolClient | undefined;
  let connectionLost = false;
  const onClientError = () => {
    connectionLost = true;
  };
  try {
    client = await context.pool.connect();
    // Hazard: while a client is checked out the pool no longer listens for its errors, and an unhandled
    // `error` event (for example from pg_terminate_backend during the acquirer wait) would crash the process.
    client.on("error", onClientError);
    // Why: the transaction stays open across the acquirer call so a slow acquirer holds this connection.
    // The cascade decoy (US-03) relies on that to saturate the pool (sandbox-telemetry-off-pool).
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO card_holds (trace_id, brand, acquirer, bin, last4, amount_cents, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'PENDING')`,
      [traceId, route.brand, route.acquirer, bin, last4, amountCents],
    );
    const status = await context.acquirers.call(route.acquirer, {
      traceId,
      amountCents,
      signal: context.signal,
    });
    const updated = await client.query(
      "UPDATE card_holds SET status = $2, decided_at = clock_timestamp() WHERE trace_id = $1",
      [traceId, status],
    );
    if (updated.rowCount !== 1) throw new Error(`hold ${traceId} missing at status update`);
    await client.query("COMMIT");
    client.off("error", onClientError);
    client.release(connectionLost ? true : undefined);
    context.telemetry.finish(entry, status);
    return { traceId, ...route, bin, last4, amountCents, status };
  } catch (error) {
    if (client) {
      let destroy = connectionLost;
      try {
        await client.query("ROLLBACK");
      } catch {
        destroy = true;
      }
      client.off("error", onClientError);
      // Why: a connection that failed or could not roll back is destroyed, not returned to the pool.
      client.release(destroy ? true : undefined);
    }
    context.telemetry.finish(entry, "ERROR");
    throw error;
  }
}
