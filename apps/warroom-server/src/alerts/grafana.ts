import { createHmac, timingSafeEqual } from "node:crypto";
import { type AlertInput, AlertSchema } from "@warroom/contracts";
import { type Static, Type } from "typebox";
import Value from "typebox/value";
import { type Adapter, assertShape, type RawRequest, StringMapSchema } from "./adapter.ts";

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

/** Context: a request is refused when its timestamp is more than this many seconds from the server clock. */
const REPLAY_WINDOW_SECONDS = 300;
const SIGNATURE_HEADER = "x-grafana-alerting-signature";
const TIMESTAMP_HEADER = "x-grafana-alerting-timestamp";

const singleHeader = (value: string | string[] | undefined) =>
  typeof value === "string" ? value : undefined;

/**
 * Checks Grafana's HMAC signature: the hex HMAC-SHA256 of the timestamp header's value, a colon and the raw body.
 * Context: Grafana's documentation gives this form and calls the timestamp header optional; the war room requires
 * it, because without it a captured request could be replayed forever.
 * Hazard: sign the raw bytes as received. A re-serialized body can differ and would make every request fail,
 * or worse, verify something other than what the parser reads.
 */
function verifySignature(secret: string, request: RawRequest): string | undefined {
  const signature = singleHeader(request.headers[SIGNATURE_HEADER]);
  if (signature === undefined) return "missing_signature";
  const timestamp = singleHeader(request.headers[TIMESTAMP_HEADER]);
  if (timestamp === undefined) return "missing_timestamp";
  if (!/^[0-9]{1,15}$/.test(timestamp)) return "bad_timestamp";
  const expected = createHmac("sha256", secret)
    .update(`${timestamp}:`)
    .update(request.rawBody)
    .digest();
  // Hazard: compare the decoded bytes in constant time; a plain string compare leaks how many leading characters match.
  const given = /^[0-9a-fA-F]{64}$/.test(signature) ? Buffer.from(signature, "hex") : undefined;
  if (given === undefined || !timingSafeEqual(given, expected)) return "bad_signature";
  // Why: the window is checked after the signature, so only a holder of the secret learns where it ends.
  if (Math.abs(request.nowMs / 1000 - Number(timestamp)) > REPLAY_WINDOW_SECONDS) {
    return "stale_timestamp";
  }
  return undefined;
}

/** The Grafana adapter; `hmacSecret` turns the signature check on. */
export function createGrafanaAdapter(options: { hmacSecret?: string } = {}): Adapter {
  const { hmacSecret } = options;
  return hmacSecret
    ? { parse, verify: (request) => verifySignature(hmacSecret, request) }
    : { parse };
}

/** The adapter without a signature check, which is what the parser tests use. */
export const grafanaAdapter: Adapter = createGrafanaAdapter();
