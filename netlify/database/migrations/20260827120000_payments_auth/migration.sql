ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "food_cost" double precision DEFAULT 0 NOT NULL;

CREATE TABLE IF NOT EXISTS "quote_payments" (
  "id" serial PRIMARY KEY NOT NULL,
  "quote_id" integer NOT NULL,
  "amount" double precision NOT NULL,
  "paid_at" timestamp NOT NULL DEFAULT now(),
  "method" varchar(40) NOT NULL DEFAULT 'transferencia',
  "notes" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);

INSERT INTO "quote_payments" ("quote_id", "amount", "paid_at", "method", "notes")
SELECT "id", "deposit_amount", COALESCE("updated_at", "created_at"), 'transferencia', 'Anticipo'
FROM "quotes"
WHERE "deposit_amount" > 0
  AND NOT EXISTS (
    SELECT 1 FROM "quote_payments" p WHERE p."quote_id" = "quotes"."id"
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quote_payments_quote_id_quotes_id_fk'
  ) THEN
    ALTER TABLE "quote_payments"
      ADD CONSTRAINT "quote_payments_quote_id_quotes_id_fk"
      FOREIGN KEY ("quote_id") REFERENCES "quotes"("id") ON DELETE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "team_users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(160) NOT NULL,
  "name" varchar(160) NOT NULL,
  "password_salt" varchar(64) NOT NULL,
  "password_hash" varchar(128) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_users_email_unique" ON "team_users" ("email");

CREATE TABLE IF NOT EXISTS "team_sessions" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "token_hash" varchar(64) NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "team_sessions_token_hash_unique" ON "team_sessions" ("token_hash");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'team_sessions_user_id_team_users_id_fk'
  ) THEN
    ALTER TABLE "team_sessions"
      ADD CONSTRAINT "team_sessions_user_id_team_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "team_users"("id") ON DELETE CASCADE;
  END IF;
END $$;
