# No stored column or telemetry field holds a full PAN, and runtime roles get only the granted table privileges

- **origin**: feature card-auth-sandbox
- **scope**: database, card-auth-sandbox
- **paths**: apps/card-auth-sandbox/**, packages/contracts/src/sandbox-telemetry.ts
- **date**: 2026-10-27

## Decision

Keep the full card number (PAN) only in memory for the length of one authorization. No `card_holds` column, telemetry field, log line, or HTTP response carries it: store and report only the first 6 digits (`bin`) and the last 4 (`last4`). The runtime roles get only the privileges a migration lists: `sandbox_app` has `SELECT, INSERT, UPDATE` on `card_holds` plus `USAGE` on its sequence, `warroom_diag` has `SELECT`, and `sandbox_admin` has `SELECT, UPDATE`. Never `GRANT ALL`, and never give a runtime role `DELETE` or `TRUNCATE`.

## Why

A stored PAN, even encrypted, puts the database in card-data scope, and the investigator sanitizer (US-05) expects masked values everywhere. A runtime role that can `DELETE` or `TRUNCATE` could erase the evidence the investigators read.

## Trade-offs

Anything that needs the whole number later, such as settlement, cannot be built on these tables.

## Not decided here

Retention or cleanup of `card_holds` rows.
