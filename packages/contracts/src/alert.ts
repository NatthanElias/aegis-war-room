import { type Static, Type } from "typebox";

/** The two alert states every adapter reports; adapters translate their tool's own words into these. */
export const AlertStatusSchema = Type.Union([Type.Literal("firing"), Type.Literal("resolved")]);

/**
 * The internal alert that every monitoring-source adapter produces.
 * Context: an incompatible change adds fields and never renames them, because stored alerts keep this shape.
 */
export const AlertSchema = Type.Object(
  {
    /** Lowercase letters, digits and `-`; names the adapter, such as `grafana`. */
    source: Type.String({ pattern: "^[a-z0-9-]{1,64}$" }),
    /** The monitoring tool's own identity for one alert series; repeats while the alert fires. */
    fingerprint: Type.String({ minLength: 1, maxLength: 256 }),
    title: Type.String({ minLength: 1, maxLength: 200 }),
    status: AlertStatusSchema,
    startedAt: Type.String({ format: "date-time" }),
    severity: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
    summary: Type.Optional(Type.String({ maxLength: 4000 })),
    url: Type.Optional(Type.String({ format: "uri", maxLength: 2048 })),
    labels: Type.Optional(
      Type.Record(Type.String(), Type.String({ maxLength: 256 }), { maxProperties: 32 }),
    ),
  },
  { additionalProperties: false },
);

export type AlertStatus = Static<typeof AlertStatusSchema>;
export type AlertInput = Static<typeof AlertSchema>;
