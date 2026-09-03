-- Operación diaria: logística, packing, gastos, staff, alergias, versiones, link público, roles, precios.
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.recipes ADD COLUMN IF NOT EXISTS allergen_tags jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS dietary_tags jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS setup_time varchar(8);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS service_time varchar(8);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS end_time varchar(8);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_contact varchar(160);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS venue_phone varchar(40);
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS packing_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS expenses jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS staff jsonb NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS parent_quote_id integer;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS public_token varchar(64);
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS due_date timestamptz;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS quotes_public_token_idx ON public.quotes (public_token);

ALTER TABLE public.team_users ADD COLUMN IF NOT EXISTS role varchar(20) NOT NULL DEFAULT 'admin';

CREATE TABLE IF NOT EXISTS public.ingredient_prices (
  id serial PRIMARY KEY,
  ingredient_id integer NOT NULL REFERENCES public.ingredients(id) ON DELETE CASCADE,
  unit_price double precision NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ingredient_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_session_all" ON public.ingredient_prices;
CREATE POLICY "team_session_all" ON public.ingredient_prices
  FOR ALL TO anon, authenticated
  USING (public.crm_is_team_member())
  WITH CHECK (public.crm_is_team_member());

DROP FUNCTION IF EXISTS internal.public_user(integer, text, text);
CREATE OR REPLACE FUNCTION internal.public_user(p_id integer, p_email text, p_name text, p_role text DEFAULT 'admin')
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'id', p_id,
    'email', p_email,
    'name', p_name,
    'role', coalesce(nullif(btrim(p_role), ''), 'admin')
  );
$$;

CREATE OR REPLACE FUNCTION internal.session_payload(p_id integer, p_email text, p_name text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  r text;
BEGIN
  SELECT role INTO r FROM public.team_users WHERE id = p_id;
  RETURN jsonb_build_object(
    'user', internal.public_user(p_id, p_email, p_name, coalesce(r, 'admin')),
    'token', p_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_status()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  configured boolean;
  uid integer;
  u public.team_users%ROWTYPE;
  has_recovery boolean;
  has_real boolean;
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.team_users) INTO configured;
  SELECT EXISTS (SELECT 1 FROM public.team_recovery) INTO has_recovery;
  SELECT EXISTS (
    SELECT 1 FROM public.team_users WHERE email <> 'demo@cateringcrm.app'
  ) INTO has_real;
  uid := internal.current_team_user_id();
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'configured', configured,
      'user', NULL,
      'hasRecovery', has_recovery,
      'demoAvailable', NOT has_real
    );
  END IF;
  SELECT * INTO u FROM public.team_users WHERE id = uid;
  RETURN jsonb_build_object(
    'configured', configured,
    'user', internal.public_user(u.id, u.email, u.name, u.role),
    'hasRecovery', has_recovery,
    'demoAvailable', NOT has_real
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_users()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
BEGIN
  IF internal.current_team_user_id() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
  RETURN coalesce(
    (
      SELECT jsonb_agg(internal.public_user(id, email, name, role) ORDER BY id)
      FROM public.team_users
    ),
    '[]'::jsonb
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_quote_public(p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  q public.quotes%ROWTYPE;
  ev public.events%ROWTYPE;
  c public.clients%ROWTYPE;
BEGIN
  IF btrim(coalesce(p_token, '')) = '' THEN
    RAISE EXCEPTION 'Enlace no válido';
  END IF;
  SELECT * INTO q FROM public.quotes WHERE public_token = p_token;
  IF q.id IS NULL THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;
  SELECT * INTO ev FROM public.events WHERE id = q.event_id;
  SELECT * INTO c FROM public.clients WHERE id = ev.client_id;
  RETURN jsonb_build_object(
    'id', q.id,
    'quoteNumber', q.quote_number,
    'quoteDate', q.quote_date,
    'items', q.items,
    'total', q.total,
    'notes', q.notes,
    'status', q.status,
    'version', q.version,
    'eventTitle', ev.title,
    'eventDate', ev.event_date,
    'location', ev.location,
    'attendees', ev.attendees,
    'clientName', c.name,
    'clientCompany', c.company
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_quote_public_respond(p_token text, p_action text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  q public.quotes%ROWTYPE;
  new_status text;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE public_token = p_token;
  IF q.id IS NULL THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;
  IF p_action = 'accept' THEN
    new_status := 'aceptada';
  ELSIF p_action = 'reject' THEN
    new_status := 'rechazada';
  ELSE
    RAISE EXCEPTION 'Acción no válida';
  END IF;
  UPDATE public.quotes SET status = new_status, updated_at = now() WHERE id = q.id;
  IF new_status = 'aceptada' THEN
    UPDATE public.events SET status = 'confirmado', updated_at = now()
    WHERE id = q.event_id AND status IN ('borrador', 'cotizado');
  END IF;
  RETURN public.crm_quote_public(p_token);
END;
$$;

REVOKE ALL ON FUNCTION public.crm_quote_public(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_quote_public_respond(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_quote_public(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_quote_public_respond(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_users() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.public_user(integer, text, text, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.crm_auth_set_role(p_user_id integer, p_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  actor_id integer;
  actor_role text;
  target public.team_users%ROWTYPE;
  next_role text;
BEGIN
  actor_id := internal.current_team_user_id();
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
  SELECT role INTO actor_role FROM public.team_users WHERE id = actor_id;
  IF coalesce(actor_role, 'admin') <> 'admin' THEN
    RAISE EXCEPTION 'No tienes permiso para esta acción';
  END IF;
  IF p_user_id = actor_id THEN
    RAISE EXCEPTION 'No puedes cambiar tu propio rol';
  END IF;
  next_role := CASE
    WHEN p_role IN ('admin', 'ventas', 'cocina') THEN p_role
    ELSE NULL
  END;
  IF next_role IS NULL THEN
    RAISE EXCEPTION 'Rol no válido';
  END IF;
  SELECT * INTO target FROM public.team_users WHERE id = p_user_id;
  IF target.id IS NULL THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;
  UPDATE public.team_users SET role = next_role, updated_at = now() WHERE id = p_user_id;
  SELECT * INTO target FROM public.team_users WHERE id = p_user_id;
  RETURN jsonb_build_object('user', internal.public_user(target.id, target.email, target.name, target.role));
END;
$$;

REVOKE ALL ON FUNCTION public.crm_auth_set_role(integer, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_auth_set_role(integer, text) TO anon, authenticated;

UPDATE public.quotes
SET public_token = substr(md5(random()::text || id::text), 1, 32)
WHERE public_token IS NULL;
