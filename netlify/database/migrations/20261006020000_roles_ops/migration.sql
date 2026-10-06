ALTER TABLE ingredients ADD COLUMN IF NOT EXISTS min_stock double precision NOT NULL DEFAULT 0;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS valid_until timestamp;
ALTER TABLE team_users ADD COLUMN IF NOT EXISTS recovery_salt varchar(64);
ALTER TABLE team_users ADD COLUMN IF NOT EXISTS recovery_hash varchar(128);
