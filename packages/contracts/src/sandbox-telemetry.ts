import { type Static, Type } from "typebox";

/** Response shapes of card-auth-sandbox's read-only `GET /telemetry/*` routes. They carry no full card number. */

export const SandboxAcquirerNameSchema = Type.Union([
  Type.Literal("acquirer-alpha"),
  Type.Literal("acquirer-beta"),
]);

export const SandboxBrandSchema = Type.Union([Type.Literal("visa"), Type.Literal("mastercard")]);

export const SandboxAuthorizationStatusSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("APPROVED"),
  Type.Literal("DECLINED"),
  Type.Literal("ERROR"),
]);

const Count = Type.Integer({ minimum: 0 });

const SandboxLatency = Type.Object(
  { p50: Type.Number(), p95: Type.Number(), max: Type.Number() },
  { additionalProperties: false },
);

const SandboxAcquirerStats = Type.Object(
  {
    approved: Count,
    declined: Count,
    errors: Count,
    inFlight: Count,
    /** Age of the oldest authorization still in flight, or `null` when none is. */
    oldestInFlightMs: Type.Union([Type.Number(), Type.Null()]),
    /** Milliseconds from start to final status over authorizations that finished in the window, or `null`. */
    latencyMs: Type.Union([SandboxLatency, Type.Null()]),
  },
  { additionalProperties: false },
);

/** `GET /telemetry/acquirers?windowSec=n`: counts and latency of authorizations started in the last `windowSec`. */
export const SandboxAcquirerTelemetry = Type.Object(
  {
    windowSec: Type.Integer({ minimum: 1, maximum: 300 }),
    generatedAt: Type.String(),
    /** Traffic-generator ticks skipped at the in-flight cap since the sandbox started. */
    dropped: Count,
    acquirers: Type.Object(
      { "acquirer-alpha": SandboxAcquirerStats, "acquirer-beta": SandboxAcquirerStats },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);

const SandboxAuthorization = Type.Object(
  {
    traceId: Type.String(),
    brand: SandboxBrandSchema,
    acquirer: SandboxAcquirerNameSchema,
    /** First 6 digits of the card number. */
    bin: Type.String({ pattern: "^[0-9]{6}$" }),
    /** Last 4 digits of the card number. */
    last4: Type.String({ pattern: "^[0-9]{4}$" }),
    amountCents: Type.Integer({ minimum: 1 }),
    status: SandboxAuthorizationStatusSchema,
    startedAt: Type.String(),
    decidedAt: Type.Union([Type.String(), Type.Null()]),
    latencyMs: Type.Union([Type.Number(), Type.Null()]),
  },
  { additionalProperties: false },
);

/** `GET /telemetry/authorizations`: authorizations started in `since`..`until`, newest first. */
export const SandboxAuthorizationList = Type.Object(
  { since: Type.String(), until: Type.String(), authorizations: Type.Array(SandboxAuthorization) },
  { additionalProperties: false },
);

/** `GET /telemetry/pool`: the live counters of the sandbox's app pool. */
export const SandboxPoolTelemetry = Type.Object(
  { max: Type.Literal(10), total: Count, idle: Count, waiting: Count },
  { additionalProperties: false },
);

export type SandboxAcquirerTelemetry = Static<typeof SandboxAcquirerTelemetry>;
export type SandboxAuthorizationList = Static<typeof SandboxAuthorizationList>;
export type SandboxPoolTelemetry = Static<typeof SandboxPoolTelemetry>;
