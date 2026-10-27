-- Roles are cluster-wide, so this file must be safe to run again in another database of the same server.
-- Hazard: the lock serializes concurrent runs in any database of the server; without it two sessions can both pass
-- the IF NOT EXISTS check and one fails. An advisory lock would not do: those are per database.
-- Context: the passwords are fixed local-development values (plan Assumptions); the stack only listens on localhost.
LOCK TABLE pg_catalog.pg_authid IN SHARE ROW EXCLUSIVE MODE;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_app') THEN
    CREATE ROLE sandbox_app LOGIN PASSWORD 'sandbox_app';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'warroom_diag') THEN
    CREATE ROLE warroom_diag LOGIN PASSWORD 'warroom_diag';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sandbox_admin') THEN
    CREATE ROLE sandbox_admin LOGIN PASSWORD 'sandbox_admin';
  END IF;
END
$$;

GRANT pg_read_all_stats TO warroom_diag;
