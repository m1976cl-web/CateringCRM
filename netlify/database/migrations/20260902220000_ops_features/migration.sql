ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "image_url" text;
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "allergen_tags" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "dietary_tags" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "setup_time" varchar(8);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "service_time" varchar(8);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "end_time" varchar(8);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "venue_contact" varchar(160);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "venue_phone" varchar(40);
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "packing_items" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "expenses" jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "staff" jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "version" integer NOT NULL DEFAULT 1;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "parent_quote_id" integer;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "public_token" varchar(64);
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "due_date" timestamp;
ALTER TABLE "quotes" ADD COLUMN IF NOT EXISTS "last_contacted_at" timestamp;

UPDATE quotes SET public_token = substr(md5(random()::text || id::text), 1, 32)
WHERE public_token IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "quotes_public_token_idx" ON "quotes" ("public_token");

ALTER TABLE "team_users" ADD COLUMN IF NOT EXISTS "role" varchar(20) NOT NULL DEFAULT 'admin';

CREATE TABLE IF NOT EXISTS "ingredient_prices" (
  "id" serial PRIMARY KEY NOT NULL,
  "ingredient_id" integer NOT NULL REFERENCES "ingredients"("id") ON DELETE CASCADE,
  "unit_price" double precision NOT NULL,
  "recorded_at" timestamp NOT NULL DEFAULT now()
);
