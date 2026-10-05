-- Bodega por movimientos y órdenes de compra con recepción.

CREATE TABLE IF NOT EXISTS public.purchase_orders (
  id serial PRIMARY KEY,
  supplier_id integer REFERENCES public.suppliers(id) ON DELETE SET NULL,
  event_id integer REFERENCES public.events(id) ON DELETE SET NULL,
  status varchar(20) NOT NULL DEFAULT 'enviada',
  invoice_number varchar(60),
  invoice_total double precision,
  notes text,
  ordered_at timestamptz NOT NULL DEFAULT now(),
  received_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.purchase_order_items (
  id serial PRIMARY KEY,
  purchase_order_id integer NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
  ingredient_id integer NOT NULL REFERENCES public.ingredients(id) ON DELETE RESTRICT,
  quantity double precision NOT NULL,
  unit varchar(20) NOT NULL,
  unit_price double precision NOT NULL DEFAULT 0,
  received_qty double precision NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.stock_movements (
  id serial PRIMARY KEY,
  ingredient_id integer NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  qty double precision NOT NULL,
  kind varchar(20) NOT NULL,
  note text,
  event_id integer REFERENCES public.events(id) ON DELETE SET NULL,
  purchase_order_id integer REFERENCES public.purchase_orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS purchase_orders_event_id_idx ON public.purchase_orders (event_id);
CREATE INDEX IF NOT EXISTS stock_movements_ingredient_id_idx ON public.stock_movements (ingredient_id);

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_session_all" ON public.purchase_orders;
CREATE POLICY "team_session_all" ON public.purchase_orders
  FOR ALL TO anon, authenticated
  USING (public.crm_is_team_member())
  WITH CHECK (public.crm_is_team_member());

DROP POLICY IF EXISTS "team_session_all" ON public.purchase_order_items;
CREATE POLICY "team_session_all" ON public.purchase_order_items
  FOR ALL TO anon, authenticated
  USING (public.crm_is_team_member())
  WITH CHECK (public.crm_is_team_member());

DROP POLICY IF EXISTS "team_session_all" ON public.stock_movements;
CREATE POLICY "team_session_all" ON public.stock_movements
  FOR ALL TO anon, authenticated
  USING (public.crm_is_team_member())
  WITH CHECK (public.crm_is_team_member());
