# Incidents enter the war room only through the authenticated alert webhook

- **origin**: team D-13
- **scope**: warroom-server, alerts
- **paths**: apps/warroom-server/**, packages/contracts/**
- **date**: 2026-10-28

## Decision

An incident enters the war room only through `POST /alerts` on `warroom-server`, authenticated with a bearer token from configuration, with a body defined in `packages/contracts`. A repeated alert with the same fingerprint starts no second investigation. The war room never polls a monitoring platform or the sandbox to decide that an incident exists. In the demo, the `monitoring-console` feature plays the company's monitoring platform and is the webhook's only caller.

## Why

Monitoring platforms such as Datadog, Grafana, Dynatrace, and PagerDuty already send alerts by webhook with a custom body and headers, so one documented body works with all of them (D-13). Keeping detection outside the war room also matches D-08: the war room learns of the outage only from what monitoring reports.

## Trade-offs

The demo needs the monitoring console running for the incident to start.

## Not decided here

The alert body's fields, the token's format, and what the war room shows for an alert before the Coordinator answers; `alert-intake` decides them.
