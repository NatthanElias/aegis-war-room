# Alert fixture provenance

Both files are webhook bodies for `POST /alerts/grafana`. The Grafana file is extracted from its concrete documented example. The Alertmanager file instantiates its documented schema with the values described below.

## grafana-firing.json

- Source: the "Default JSON payload" example, two firing alerts, on
  https://grafana.com/docs/grafana/latest/alerting/configure-notifications/manage-contact-points/integrations/webhook-notifier/
- Retrieved: 2026-10-29, raw HTML fetched with curl.
- Method: the JSON object that starts with `"receiver": "My Super Webhook"` was cut out of the page text and
  re-indented with a JSON serializer. Keys, values and key order are the page's.

## alertmanager-firing.json

- Source: the webhook JSON format ("version": "4") under `webhook_config` on
  https://prometheus.io/docs/alerting/latest/configuration/
- Retrieved: 2026-10-29, raw HTML fetched with curl.
- Method: the Prometheus page gives the body only as a schema with placeholders (`<string>`, `<object>`,
  `<rfc3339>`), not as a concrete example. This file uses exactly the documented keys, in the documented order, with
  concrete values of the documented types. The alert values (names, fingerprints, URLs) are invented for the test.
