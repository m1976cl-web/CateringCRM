-- Abonos por cotización, costo de ingredientes y login de equipo
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS food_cost double precision NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS quote_payments (
  id serial PRIMARY KEY,
  quote_id integer NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  amount double precision NOT NULL,
  paid_at timestamptz NOT NULL DEFAULT now(),
  method varchar(40) NOT NULL DEFAULT 'transferencia',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO quote_payments (quote_id, amount, paid_at, method, notes)
SELECT id, deposit_amount, COALESCE(updated_at, created_at), 'transferencia', 'Anticipo'
FROM quotes
WHERE deposit_amount > 0
  AND NOT EXISTS (
    SELECT 1 FROM quote_payments p WHERE p.quote_id = quotes.id
  );

CREATE TABLE IF NOT EXISTS team_users (
  id serial PRIMARY KEY,
  email varchar(160) NOT NULL UNIQUE,
  name varchar(160) NOT NULL,
  password_salt varchar(64) NOT NULL,
  password_hash varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS team_sessions (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES team_users(id) ON DELETE CASCADE,
  token_hash varchar(64) NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE quote_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_sessions ENABLE ROW LEVEL SECURITY;

GRANT ALL ON quote_payments, team_users, team_sessions TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['quote_payments', 'team_users', 'team_sessions']
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "v1_anon_all" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "v1_anon_all" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
