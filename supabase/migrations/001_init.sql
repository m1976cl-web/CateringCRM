-- CateringCRM — esquema inicial para Supabase (Postgres)
-- Ejecutar en: Supabase → SQL Editor → New query → Run
-- Coincide con db/schema.ts (Netlify/Drizzle).

-- Tablas base
CREATE TABLE IF NOT EXISTS clients (
  id serial PRIMARY KEY,
  name varchar(200) NOT NULL,
  phone varchar(40),
  email varchar(160),
  company varchar(200),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS suppliers (
  id serial PRIMARY KEY,
  name varchar(200) NOT NULL,
  contact_name varchar(160),
  phone varchar(40),
  email varchar(160),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ingredients (
  id serial PRIMARY KEY,
  name varchar(200) NOT NULL,
  unit varchar(20) NOT NULL,
  supplier_id integer REFERENCES suppliers(id) ON DELETE SET NULL,
  unit_price double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipes (
  id serial PRIMARY KEY,
  name varchar(200) NOT NULL,
  yield_portions integer NOT NULL DEFAULT 1,
  category varchar(80),
  instructions text,
  estimated_cost double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipe_ingredients (
  id serial PRIMARY KEY,
  recipe_id integer NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  ingredient_id integer NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity double precision NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id serial PRIMARY KEY,
  client_id integer NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  title varchar(200) NOT NULL,
  event_date timestamptz NOT NULL,
  location varchar(300),
  attendees integer NOT NULL DEFAULT 1,
  status varchar(40) NOT NULL DEFAULT 'borrador',
  dietary_restrictions text,
  notes text,
  estimated_cost double precision,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS event_services (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  service_type varchar(40) NOT NULL
);

CREATE TABLE IF NOT EXISTS event_recipes (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  recipe_id integer NOT NULL REFERENCES recipes(id) ON DELETE RESTRICT,
  service_type varchar(40) NOT NULL,
  portions integer NOT NULL
);

CREATE TABLE IF NOT EXISTS quotes (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  quote_number varchar(40),
  quote_date timestamptz NOT NULL DEFAULT now(),
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  total double precision NOT NULL DEFAULT 0,
  notes text,
  status varchar(40) NOT NULL DEFAULT 'borrador',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_lists (
  id serial PRIMARY KEY,
  event_id integer NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  status varchar(40) NOT NULL DEFAULT 'pendiente',
  generated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shopping_list_items (
  id serial PRIMARY KEY,
  shopping_list_id integer NOT NULL REFERENCES shopping_lists(id) ON DELETE CASCADE,
  ingredient_id integer NOT NULL REFERENCES ingredients(id) ON DELETE RESTRICT,
  quantity double precision NOT NULL,
  unit varchar(20) NOT NULL,
  purchased boolean NOT NULL DEFAULT false
);

-- Permisos para la anon key (v1 sin login)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;

-- RLS permisivo (mismo nivel de apertura que una URL pública sin auth)
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopping_list_items ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients', 'suppliers', 'ingredients', 'recipes', 'recipe_ingredients',
    'events', 'event_services', 'event_recipes', 'quotes',
    'shopping_lists', 'shopping_list_items'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "v1_anon_all" ON %I', t);
    EXECUTE format(
      'CREATE POLICY "v1_anon_all" ON %I FOR ALL TO anon, authenticated USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;
END $$;
