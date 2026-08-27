CREATE TABLE IF NOT EXISTS "team_recovery" (
  "id" serial PRIMARY KEY NOT NULL,
  "code_salt" varchar(64) NOT NULL,
  "code_hash" varchar(128) NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);
