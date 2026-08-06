-- Add suitable_services and inventory stock
ALTER TABLE "ingredients" ADD COLUMN IF NOT EXISTS "stock_qty" double precision DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "recipes" ADD COLUMN IF NOT EXISTS "suitable_services" jsonb DEFAULT '[]'::jsonb NOT NULL;
