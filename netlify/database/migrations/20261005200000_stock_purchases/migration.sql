CREATE TABLE IF NOT EXISTS "purchase_orders" (
  "id" serial PRIMARY KEY NOT NULL,
  "supplier_id" integer,
  "event_id" integer,
  "status" varchar(20) NOT NULL DEFAULT 'enviada',
  "invoice_number" varchar(60),
  "invoice_total" double precision,
  "notes" text,
  "ordered_at" timestamp NOT NULL DEFAULT now(),
  "received_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "purchase_order_items" (
  "id" serial PRIMARY KEY NOT NULL,
  "purchase_order_id" integer NOT NULL,
  "ingredient_id" integer NOT NULL,
  "quantity" double precision NOT NULL,
  "unit" varchar(20) NOT NULL,
  "unit_price" double precision NOT NULL DEFAULT 0,
  "received_qty" double precision NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS "stock_movements" (
  "id" serial PRIMARY KEY NOT NULL,
  "ingredient_id" integer NOT NULL,
  "qty" double precision NOT NULL,
  "kind" varchar(20) NOT NULL,
  "note" text,
  "event_id" integer,
  "purchase_order_id" integer,
  "created_at" timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_supplier_id_suppliers_id_fk') THEN
    ALTER TABLE "purchase_orders"
      ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk"
      FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_orders_event_id_events_id_fk') THEN
    ALTER TABLE "purchase_orders"
      ADD CONSTRAINT "purchase_orders_event_id_events_id_fk"
      FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_purchase_order_id_fk') THEN
    ALTER TABLE "purchase_order_items"
      ADD CONSTRAINT "purchase_order_items_purchase_order_id_fk"
      FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_ingredient_id_fk') THEN
    ALTER TABLE "purchase_order_items"
      ADD CONSTRAINT "purchase_order_items_ingredient_id_fk"
      FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_ingredient_id_fk') THEN
    ALTER TABLE "stock_movements"
      ADD CONSTRAINT "stock_movements_ingredient_id_fk"
      FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_event_id_fk') THEN
    ALTER TABLE "stock_movements"
      ADD CONSTRAINT "stock_movements_event_id_fk"
      FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'stock_movements_purchase_order_id_fk') THEN
    ALTER TABLE "stock_movements"
      ADD CONSTRAINT "stock_movements_purchase_order_id_fk"
      FOREIGN KEY ("purchase_order_id") REFERENCES "purchase_orders"("id") ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "purchase_orders_event_id_idx" ON "purchase_orders" ("event_id");
CREATE INDEX IF NOT EXISTS "stock_movements_ingredient_id_idx" ON "stock_movements" ("ingredient_id");
