import { type AlertInput, AlertSchema } from "@warroom/contracts";
import { type Static, Type } from "typebox";
import Value from "typebox/value";
import { type Adapter, assertShape, StringMapSchema } from "./adapter.ts";

const SOURCE = "grafana";
const FALLBACK_TITLE = "Grafana alert";
const MAX_TITLE = 200;
const MAX_SUMMARY = 4000;
const MAX_SEVERITY = 32;
const MAX_LABELS = 32;
const MAX_LABEL_VALUE = 256;

/**
 * The part of the webhook body this adapter reads; every other field is ignored.
 * Context: Grafana's webhook contact point and Prometheus Alertmanager's `webhook_config` send the same
 * `alerts` array, so one adapter reads both.
 */
const GrafanaBodySchema = Type.Object({
  alerts: Type.Array(
    Type.Object({
      status: Type.Union([Type.Literal("firing"), Type.Literal("resolved")]),
      fingerprint: Type.String({ minLength: 1, maxLength: 256 }),
      startsAt: Type.String({ format: "date-time" }),
      labels: StringMapSchema,
      annotations: Type.Optional(Type.Record(Type.String(), Type.Unknown())),
      generatorURL: Type.Optional(Type.Unknown()),
    }),
    { minItems: 1, maxItems: 100 },
  ),
});

/** Why: long values are cut, not rejected, so one verbose alert cannot make a monitoring tool retry forever. */
const cut = (text: string, max: number) => text.slice(0, max);

const nonEmpty = (value: unknown): string | undefined =>
  typeof value === "string" && value !== "" ? value : undefined;

function parse(body: unknown): AlertInput[] {
  assertShape(GrafanaBodySchema, body);
  const alerts: Static<typeof GrafanaBodySchema>["alerts"] = body.alerts;
  return alerts.map((item) => {
    const labels = Object.fromEntries(
      Object.keys(item.labels)
        .sort()
        .slice(0, MAX_LABELS)
        .map((key) => [key, cut(item.labels[key] as string, MAX_LABEL_VALUE)]),
    );
    const summary = nonEmpty(item.annotations?.summary) ?? nonEmpty(item.annotations?.description);
    const severity = nonEmpty(item.labels.severity);
    const alert: AlertInput = {
      source: SOURCE,
      fingerprint: item.fingerprint,
      title: cut(nonEmpty(item.labels.alertname) ?? FALLBACK_TITLE, MAX_TITLE),
      status: item.status,
      startedAt: item.startsAt,
      labels,
    };
    if (summary !== undefined) alert.summary = cut(summary, MAX_SUMMARY);
    if (severity !== undefined) alert.severity = cut(severity, MAX_SEVERITY);
    // Why: Grafana sends an empty `generatorURL` for some alerts; that must not reject the alert.
    const url = nonEmpty(item.generatorURL);
    if (url !== undefined && Value.Check(AlertSchema.properties.url, url)) alert.url = url;
    return alert;
  });
}

export const grafanaAdapter: Adapter = { parse };
