ALTER TABLE events ADD COLUMN IF NOT EXISTS stock_consumed boolean NOT NULL DEFAULT false;
