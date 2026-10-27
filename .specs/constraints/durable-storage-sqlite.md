# Incident state is one pi-durable SQLite file per incident ID

- **origin**: feature walking-skeleton
- **scope**: storage, warroom-server
- **paths**: apps/warroom-server/**, docker-compose.yml
- **date**: 2026-10-27

## Decision

Open pi-durable with `openNodeSqliteStorage` on one file per incident, `incidents/{incidentId}.db`, on a named volume. The incident ID comes from `INCIDENT_ID` (default `demo`) and may contain only letters, digits, `-`, and `_`.

## Why

JSONL storage keeps the whole history in memory, and pi-durable's README recommends SQLite for long-running agents. One file per incident keeps every incident's transcript, receipts, and approvals together.

## Trade-offs

Only one process may own a file at a time; pi-durable does no cross-process locking.

## Not decided here

Resuming running tasks after a crash (US-10).
