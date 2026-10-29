# Alert webhook guide

The war room learns about an outage from a monitoring tool, through `POST /alerts/grafana`. This guide shows how to point Grafana or Prometheus Alertmanager at it, what the server answers, and how to add a monitoring tool. `docs/security.md` lists what the webhook enforces and what a production release would still need. `docs/architecture-reference.md` explains how the war room stores and uses an alert.

## What you need

- `WARROOM_ALERT_TOKEN`: a shared secret, sent as `Authorization: Bearer <token>`. Without it every `/alerts` request answers `503`. Generate one with `openssl rand -hex 24` and put it in the git-ignored `.env`. `.env.example` lists every variable.
- `WARROOM_GRAFANA_HMAC_SECRET` (optional): turns on the Grafana signature check described below.
- The URL. Inside the Docker Compose network it is `http://warroom-server:3000/alerts/grafana`. From your own machine it is `http://127.0.0.1:8080/alerts/grafana`; compose publishes the war room on the loopback interface only.

After changing `.env`, run `docker compose up --wait --build` so the container sees the new values.

## Grafana contact point

Use Grafana 12.0 or later; earlier versions cannot sign webhook requests. `npm run check:grafana` starts the pinned image `grafana/grafana:12.4.14` with a provisioned contact point and an always-firing rule, and fails unless the war room records the alert.

In Grafana, open Alerting, Contact points, and add a contact point of type Webhook:

| Setting | Value |
| :--- | :--- |
| URL | `http://warroom-server:3000/alerts/grafana` |
| HTTP Method | `POST` |
| Authentication Header Scheme | `Bearer` |
| Authentication Header Credentials | the value of `WARROOM_ALERT_TOKEN` |
| HMAC Signature, Secret | the value of `WARROOM_GRAFANA_HMAC_SECRET` |
| HMAC Signature, Header | `X-Grafana-Alerting-Signature` |
| HMAC Signature, Timestamp Header | `X-Grafana-Alerting-Timestamp` |

Do not put the token in the URL; URLs end up in proxy and access logs. Then add a notification policy that routes the alerts you care about to this contact point.

The same contact point as a provisioning file, which is what `scripts/grafana/provisioning/alerting/warroom.yaml` does with environment variables:

```yaml
apiVersion: 1
contactPoints:
  - orgId: 1
    name: warroom
    receivers:
      - uid: warroom-webhook
        type: webhook
        settings:
          url: http://warroom-server:3000/alerts/grafana
          httpMethod: POST
          authorization_scheme: Bearer
          authorization_credentials: <token>
          hmacConfig:
            secret: <hmac secret>
            header: X-Grafana-Alerting-Signature
            timestampHeader: X-Grafana-Alerting-Timestamp
```

### How the signature is checked

When `WARROOM_GRAFANA_HMAC_SECRET` is set, every request to `/alerts/grafana` must carry `X-Grafana-Alerting-Signature` and `X-Grafana-Alerting-Timestamp`. The signature is the hex HMAC-SHA256, keyed with the secret, of the timestamp value, a colon, and the raw request body. The timestamp is Unix time in whole seconds, and the server refuses a request whose timestamp is more than 300 seconds from its own clock. A refused request answers `401` and the server logs the reason: `missing_signature`, `missing_timestamp`, `bad_timestamp`, `bad_signature`, or `stale_timestamp`.

Keep the host's clock close to real time; a server clock that is more than five minutes off makes every Grafana request look stale. Grafana's own documentation describes the same colon form, and `npm run check:grafana` confirmed that Grafana 12.4.14 signs this way.

## Prometheus Alertmanager

Alertmanager sends the same `alerts` array, so its webhook goes to the same URL. It cannot sign requests, so the bearer token is its only credential. Leave `WARROOM_GRAFANA_HMAC_SECRET` empty if Alertmanager is a source, because with the secret set the server refuses every unsigned request.

```yaml
receivers:
  - name: warroom
    webhook_configs:
      - url: http://warroom-server:3000/alerts/grafana
        send_resolved: true
        http_config:
          authorization:
            type: Bearer
            credentials: <token>
```

`send_resolved: true` lets the war room mark an alert resolved. The configuration reference is the `webhook_config` section of https://prometheus.io/docs/alerting/latest/configuration/.

## What the adapter reads

Each item of the `alerts` array (1 to 100 items) needs `status` (`firing` or `resolved`), `fingerprint` (1 to 256 characters), `startsAt` (an ISO 8601 date-time) and `labels` (string values). The war room reads these optional fields:

- `labels.alertname` is the title, or `Grafana alert` when absent.
- `annotations.summary` is the summary, or `annotations.description` when there is no summary.
- `labels.severity` is the severity.
- `generatorURL` is the URL, kept only when it is a valid URI.

Every other field is ignored. Long values are cut to the limits instead of rejected: the title to 200 characters, the summary to 4,000, and the labels to the first 32 keys in sorted order with values up to 256 characters. The war room deduplicates by source and fingerprint while an alert is firing, and a firing alert after a resolution is a new alert with a new `AL-NN` ID.

## Answers

A request that passes every check answers `202` when at least one alert is new and `200` otherwise, with one entry per alert in the body, in body order:

```json
{"alerts":[{"alertId":"AL-01","fingerprint":"a1b2","status":"accepted"}]}
```

An entry is `accepted` (new alert), `duplicate` (a firing alert with the same fingerprint exists), `resolved` (the firing alert is now resolved), or `ignored` (a resolution with no firing alert; it has no `alertId`). Senders stop retrying on `200` and `202`.

| Status | Body | When |
| :--- | :--- | :--- |
| `202` | `{"alerts":[...]}` | At least one alert is `accepted`. |
| `200` | `{"alerts":[...]}` | No alert is `accepted`: duplicates, resolutions, or ignored resolutions. |
| `400` | `{"error":"invalid_alert","detail":"/alerts/0/fingerprint is required"}` | The body is not JSON or fails the schema; `detail` names the field. |
| `401` | `{"error":"unauthorized"}` with `WWW-Authenticate: Bearer` | The token is missing or wrong, or the Grafana signature or timestamp is missing, wrong or stale. |
| `404` | `{"error":"unknown_source"}` | The path names a source with no adapter, such as `/alerts/datadog`. |
| `405` | `{"error":"method_not_allowed"}` with `Allow: POST` | The method is not `POST`. |
| `413` | `{"error":"payload_too_large"}` | The body is over 262,144 bytes. |
| `415` | `{"error":"unsupported_media_type"}` | `Content-Type` is not `application/json`. |
| `429` | `{"error":"rate_limited"}` with `Retry-After` in seconds | The request's new alerts would pass `WARROOM_ALERT_RATE_LIMIT` for the last 60 seconds. Nothing is stored; send the whole request again after the delay. |
| `503` | `{"error":"alerts_disabled"}` | `WARROOM_ALERT_TOKEN` is unset or empty. |

Duplicates and resolutions never count against the rate limit. A single request with more new alerts than the whole limit can never fit and always answers `429`.

## Adding an adapter for another monitoring tool

Each tool gets one adapter, because every tool has its own body and its own status words. The first adapter is `grafana`.

1. Copy a real example body from the tool's documentation into `apps/warroom-server/test/fixtures/` and note its source in `PROVENANCE.md` there.
2. Create `apps/warroom-server/src/alerts/<source>.ts`. Export a function that returns an `Adapter` (see `adapter.ts`): `parse(body)` returns `AlertInput[]` as defined by `AlertSchema` in `packages/contracts/src/alert.ts`, and throws `InvalidAlertError` for a body it cannot read. `source` is lowercase letters, digits and `-`. Cut long values to the limits instead of rejecting them. Add `verify(request)` if the tool can sign its requests; it receives the headers and the raw body bytes and returns the reason for refusing, or `undefined`.
3. Register it in the `adapters` map in `apps/warroom-server/src/alerts/index.ts`. The route `POST /alerts/<source>` then exists, with the same token check, size limit and rate limit.
4. Write tests that parse the fixture and check the stored fields against literal values, and tests for each rejection. Use `apps/warroom-server/test/grafana-adapter.test.ts` as the model.
5. Run the tool itself against the war room once before relying on the adapter, as `npm run check:grafana` does for Grafana.
6. Add the tool's setup steps to this guide.
