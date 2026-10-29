# Security report: alert intake

This report covers the alert webhook `POST /alerts/grafana` and the model setup that came with it. It lists what the code enforces today, then what a production release would still need. The war room is a proof of concept for a defended project; the gaps below are recorded, not built.

## Enforced controls

Each control is enforced by `apps/warroom-server/src/alerts/` and proved by a test named in `.specs/features/alert-intake/checks.md`.

- **Bearer token.** `WARROOM_ALERT_TOKEN` is the one shared credential. Every `/alerts` path answers `503` when it is unset or empty, and there is no default token. A request without a matching `Authorization: Bearer` header answers `401`, before the body is parsed.
- **Constant-time compare.** The token is compared with `timingSafeEqual` on SHA-256 digests of both values, so neither the match length nor the token length leaks through timing.
- **Grafana signature.** When `WARROOM_GRAFANA_HMAC_SECRET` is set, the request must carry `X-Grafana-Alerting-Signature`, the hex HMAC-SHA256 of the timestamp, a colon, and the raw body. It is compared in constant time against the bytes as received. The check only covers `grafana`; Alertmanager cannot sign, so with Alertmanager as a source the token is the only credential.
- **Replay window.** The signature must come with `X-Grafana-Alerting-Timestamp` within 300 seconds of the server clock. A captured request cannot be replayed after that. Inside the window a replay is still accepted by the signature check, but it is a duplicate of a firing alert, so it starts nothing new.
- **Body limit.** A body over 262,144 bytes answers `413`, and the server stops buffering at the limit.
- **Content type.** Only `application/json` is read; anything else answers `415`.
- **Rate limit.** At most `WARROOM_ALERT_RATE_LIMIT` new alerts (default 30) are accepted per sliding 60 seconds across all sources. A request whose new alerts do not fit is rejected whole with `429` and stores nothing. Duplicates and resolutions are free.
- **Idempotency.** One alert is one Coordinator input: the alert ID is the `requestId` of the root submission, so retries, concurrent identical requests and a crash between storing and submitting never start a second run.
- **Untrusted marking.** Everything from the monitoring platform is capped in length (title 200 characters, summary 4,000, 32 labels of 256) and reaches the Coordinator JSON-quoted and labeled `untrusted text`, so a newline in an alert cannot forge a line of the input.
- **Refusal logging.** Each refused request logs its reason (`missing_token`, `bad_token`, `missing_signature`, `missing_timestamp`, `bad_timestamp`, `bad_signature`, `stale_timestamp`) without the token or the body. The answer to the caller is the same `401` for every reason.
- **No key, no failure.** A missing `OPENROUTER_API_KEY` leaves the Coordinator offline at startup instead of failing, and tests never reach OpenRouter.

What is not tested: constant-time behavior cannot be observed from a test, so it is checked by reading the code.

## Production gaps

| Gap | Risk | What closing it needs |
| :--- | :--- | :--- |
| Real user login | Browsers pick a seeded user with a query parameter, so anyone who can reach the port can act as the Incident Commander. The webhook token does not identify a person. | An identity provider (OIDC), sessions on the server, and roles taken from the verified identity. Real login is a Won't for this project (D-07). |
| Card data sent to the model provider | Alert labels and annotations are copied into the Coordinator's input and sent to OpenRouter. A card number in an alert would leave the system. | The `webhook-injection` sanitize pipeline (US-11) that removes card numbers before storing or sending, a data-processing agreement with the provider, and an allow-list of label keys. |
| Prompt injection | A person who can cause an alert, or an attacker holding the token, controls text that the model reads. The untrusted label is advice to the model, not a barrier. | The Jev classifier on alert text (US-11), no mutating tools for agents (already true), and Two-Key Break-Glass approval for every remediation (already true). |
| Token rotation and TLS | One long-lived token is shared by all callers, and the webhook is plain HTTP. Anyone on the network path can read the token and the alert bodies. A leaked token cannot be revoked without a restart. | TLS in front of the server, several named tokens with expiry stored outside `.env`, rotation without a restart, and mutual TLS or OAuth as a new verifier per adapter. |
| Model spend caps | The rate limit bounds alerts per minute, not money. 30 alerts a minute still starts 30 paid model runs a minute, and the limit resets when the process restarts. | A budget per incident and per day enforced before each model call, an alert when spend passes a threshold, and a rate limit stored with the incident so a restart does not clear it. |
| Audit trail | Alerts, refusals and approvals are not recorded in a form that proves nothing was changed afterwards. Refusals exist only as log lines. | An append-only, hash-chained log of alerts, refused requests and decisions, written outside the SQLite file the application can edit. |

## Reporting

Report a security problem to the repository owner directly, not in a public issue.
