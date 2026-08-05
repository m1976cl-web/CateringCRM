CREATE TABLE "clients" (
	"id" serial PRIMARY KEY,
	"name" varchar(200) NOT NULL,
	"phone" varchar(40),
	"email" varchar(160),
	"company" varchar(200),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_recipes" (
	"id" serial PRIMARY KEY,
	"event_id" integer NOT NULL,
	"recipe_id" integer NOT NULL,
	"service_type" varchar(40) NOT NULL,
	"portions" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_services" (
	"id" serial PRIMARY KEY,
	"event_id" integer NOT NULL,
	"service_type" varchar(40) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY,
	"client_id" integer NOT NULL,
	"title" varchar(200) NOT NULL,
	"event_date" timestamp NOT NULL,
	"location" varchar(300),
	"attendees" integer DEFAULT 1 NOT NULL,
	"status" varchar(40) DEFAULT 'borrador' NOT NULL,
	"dietary_restrictions" text,
	"notes" text,
	"estimated_cost" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" serial PRIMARY KEY,
	"name" varchar(200) NOT NULL,
	"unit" varchar(20) NOT NULL,
	"supplier_id" integer,
	"unit_price" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" serial PRIMARY KEY,
	"event_id" integer NOT NULL,
	"quote_number" varchar(40),
	"quote_date" timestamp DEFAULT now() NOT NULL,
	"items" jsonb DEFAULT '[]' NOT NULL,
	"total" double precision DEFAULT 0 NOT NULL,
	"notes" text,
	"status" varchar(40) DEFAULT 'borrador' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" serial PRIMARY KEY,
	"recipe_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"quantity" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" serial PRIMARY KEY,
	"name" varchar(200) NOT NULL,
	"yield_portions" integer DEFAULT 1 NOT NULL,
	"category" varchar(80),
	"instructions" text,
	"estimated_cost" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_list_items" (
	"id" serial PRIMARY KEY,
	"shopping_list_id" integer NOT NULL,
	"ingredient_id" integer NOT NULL,
	"quantity" double precision NOT NULL,
	"unit" varchar(20) NOT NULL,
	"purchased" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shopping_lists" (
	"id" serial PRIMARY KEY,
	"event_id" integer NOT NULL,
	"status" varchar(40) DEFAULT 'pendiente' NOT NULL,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" serial PRIMARY KEY,
	"name" varchar(200) NOT NULL,
	"contact_name" varchar(160),
	"phone" varchar(40),
	"email" varchar(160),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_recipes" ADD CONSTRAINT "event_recipes_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "event_recipes" ADD CONSTRAINT "event_recipes_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "event_services" ADD CONSTRAINT "event_services_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_client_id_clients_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_supplier_id_suppliers_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fkey" FOREIGN KEY ("recipe_id") REFERENCES "recipes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_ingredient_id_ingredients_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_shopping_list_id_shopping_lists_id_fkey" FOREIGN KEY ("shopping_list_id") REFERENCES "shopping_lists"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "shopping_list_items" ADD CONSTRAINT "shopping_list_items_ingredient_id_ingredients_id_fkey" FOREIGN KEY ("ingredient_id") REFERENCES "ingredients"("id") ON DELETE RESTRICT;--> statement-breakpoint
ALTER TABLE "shopping_lists" ADD CONSTRAINT "shopping_lists_event_id_events_id_fkey" FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE CASCADE;