# Incidents enter the war room only through authenticated alert webhooks

- **origin**: team D-16
- **scope**: warroom-server, alerts, monitoring
- **paths**: apps/warroom-server/**, packages/contracts/**, docker-compose.yml
- **date**: 2026-10-28
- **replaces**: alerts-via-webhook

## Decision

An incident enters the war room only through `POST /alerts/<source>` on `warroom-server`. Each monitoring source has one adapter that reads that tool's own webhook body and turns it into the internal alert defined in `packages/contracts`; the first is `grafana`, which reads Grafana's and Prometheus Alertmanager's body, and every other tool joins later as one more adapter. Every request is authenticated before its body is parsed. A repeated alert with the same source and fingerprint starts no second investigation. The war room never polls a monitoring platform or the sandbox to decide that an incident exists. In the demo, Grafana with Prometheus plays the company's monitoring platform and is the webhook's caller.

## Why

Companies already run monitoring tools that send alerts by webhook, and incident products integrate with them through one adapter per source, so a platform engineer only pastes a URL and a secret (D-16). Using Grafana, the most common open-source stack, removes a monitoring app of our own and shows the war room plugging into a real tool. Keeping detection outside the war room also matches D-08: the war room learns of the outage only from what monitoring reports.

## Trade-offs

Each new monitoring source needs its own adapter file. The demo stack runs two more containers, and the alert arrives tens of seconds after the fault, once Grafana's rule evaluates.

## Not decided here

The internal alert's fields, the authentication of each adapter, and rate limits; `alert-intake` decides them. Dashboards, metrics, and the alert rule; `monitoring-stack` decides them.
