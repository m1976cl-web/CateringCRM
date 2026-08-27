ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "deposit_amount" double precision DEFAULT 0 NOT NULL;
