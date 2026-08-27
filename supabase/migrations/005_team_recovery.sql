-- Código de recuperación del equipo (sin email)
CREATE TABLE IF NOT EXISTS team_recovery (
  id serial PRIMARY KEY,
  code_salt varchar(64) NOT NULL,
  code_hash varchar(128) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE team_recovery ENABLE ROW LEVEL SECURITY;
GRANT ALL ON team_recovery TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "v1_anon_all" ON team_recovery';
  EXECUTE 'CREATE POLICY "v1_anon_all" ON team_recovery FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)';
END $$;
