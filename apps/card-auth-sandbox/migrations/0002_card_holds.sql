-- One row per committed authorization. An ERROR authorization rolls back, so it leaves no row.
-- Hazard: there is no PAN column on purpose. Only the first 6 and last 4 digits are stored (card-holds-no-pan).
CREATE TABLE card_holds (
  id bigserial PRIMARY KEY,
  trace_id uuid NOT NULL UNIQUE,
  brand text NOT NULL CHECK (brand IN ('visa', 'mastercard')),
  acquirer text NOT NULL CHECK (acquirer IN ('acquirer-alpha', 'acquirer-beta')),
  bin char(6) NOT NULL CHECK (bin ~ '^[0-9]{6}$'),
  last4 char(4) NOT NULL CHECK (last4 ~ '^[0-9]{4}$'),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  status text NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'DECLINED', 'ERROR')),
  created_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz
);

-- Why: no DELETE or TRUNCATE for any runtime role, because investigators read these rows as evidence.
GRANT SELECT, INSERT, UPDATE ON card_holds TO sandbox_app;
GRANT USAGE ON SEQUENCE card_holds_id_seq TO sandbox_app;
GRANT SELECT ON card_holds TO warroom_diag;
GRANT SELECT, UPDATE ON card_holds TO sandbox_admin;
