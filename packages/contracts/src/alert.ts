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

/** `AL-01`, `AL-02`, ... `AL-123`; at least two digits, allocated by the war room and never reused. */
export const AlertIdSchema = Type.String({ pattern: "^AL-[0-9]{2,}$" });

/**
 * An alert as `app.warroom` stores it: the adapter's alert plus the war room's ID and times.
 * Context: `labels` is always present here (`{}` when the source sent none), unlike in `AlertSchema`.
 */
export const AlertRecordSchema = Type.Object(
  {
    id: AlertIdSchema,
    source: AlertSchema.properties.source,
    fingerprint: AlertSchema.properties.fingerprint,
    status: AlertStatusSchema,
    title: AlertSchema.properties.title,
    severity: AlertSchema.properties.severity,
    summary: AlertSchema.properties.summary,
    url: AlertSchema.properties.url,
    labels: Type.Record(Type.String(), Type.String({ maxLength: 256 })),
    startedAt: AlertSchema.properties.startedAt,
    receivedAt: Type.String({ format: "date-time" }),
    resolvedAt: Type.Optional(Type.String({ format: "date-time" })),
  },
  { additionalProperties: false },
);

export type Alert = Static<typeof AlertRecordSchema>;
