# Authorizations hold their transaction across the acquirer call, and sandbox telemetry never reads through the app pool

- **origin**: feature card-auth-sandbox
- **scope**: card-auth-sandbox
- **paths**: apps/card-auth-sandbox/src/**
- **date**: 2026-10-27

## Decision

An authorization runs `BEGIN`, the `PENDING` insert, the acquirer call, the status update, and `COMMIT` on one `sandbox_app` pool connection, so the transaction stays open while the acquirer answers. Sandbox telemetry routes answer from the in-process window and the pool's live counters and never run SQL, on the app pool or any other pool.

## Why

The cascade decoy (US-03) needs slow acquirer calls to exhaust the 10-connection app pool, which only happens if the transaction stays open. Telemetry that queried through that pool would block exactly when the pool saturates, which is when investigators need it. A fourth pool would break the three-pool design in `docs/architecture-reference.md`.

## Trade-offs

Telemetry resets when the sandbox restarts, and it keeps at most 300 s and 10,000 entries.

## Not decided here

How a timeout or a remediation ends a held transaction (US-09).
