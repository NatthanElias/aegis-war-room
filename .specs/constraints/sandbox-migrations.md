# Schema changes are forward-only SQL files applied by the one-shot migrate service

- **origin**: feature walking-skeleton
- **scope**: database, card-auth-sandbox
- **paths**: apps/card-auth-sandbox/migrations/**, apps/card-auth-sandbox/src/migrat*, docker-compose.yml
- **date**: 2026-10-27

## Decision

Change the PostgreSQL schema only with forward-only files `apps/card-auth-sandbox/migrations/NNNN_{words}.sql`. The one-shot compose service `migrate` applies them as the `postgres` superuser, each file in its own transaction, and records the file name in `sandbox_migrations(name text primary key, applied_at timestamptz)`. Runtime services connect only as `sandbox_app`, `warroom_diag`, or `sandbox_admin`.

## Why

A sandbox that migrated at startup would hold superuser credentials. The ledger is not called `schema_migrations` because that name is the simulated deployment history that Rollback Safety reads.

## Trade-offs

A file that must create cluster-wide objects (roles) has to be safe to run again in another database and to run concurrently, as `0001_roles.sql` is.

## Not decided here

Down migrations and the simulated `schema_migrations` table (US-02 onward).
