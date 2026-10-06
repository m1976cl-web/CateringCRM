-- Permisos por rol, código de recuperación personal, stock mínimo y vigencia de cotización.
ALTER TABLE public.ingredients ADD COLUMN IF NOT EXISTS min_stock double precision NOT NULL DEFAULT 0;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS valid_until timestamptz;
ALTER TABLE public.team_users ADD COLUMN IF NOT EXISTS recovery_salt varchar(64);
ALTER TABLE public.team_users ADD COLUMN IF NOT EXISTS recovery_hash varchar(128);

CREATE OR REPLACE FUNCTION internal.session_payload(p_id integer, p_email text, p_name text, p_token text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  actor_role text;
BEGIN
  SELECT role INTO actor_role FROM public.team_users WHERE id = p_id;
  RETURN jsonb_build_object(
    'user', internal.public_user(p_id, p_email, p_name, actor_role),
    'token', p_token
  );
END;
$$;

CREATE OR REPLACE FUNCTION internal.require_admin()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  uid integer;
  actor_role text;
BEGIN
  uid := internal.current_team_user_id();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
  SELECT role INTO actor_role FROM public.team_users WHERE id = uid;
  IF coalesce(actor_role, 'admin') <> 'admin' THEN
    RAISE EXCEPTION 'No tienes permiso para esta acción';
  END IF;
  RETURN uid;
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_enforce_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  uid integer;
  actor text;
BEGIN
  uid := internal.current_team_user_id();
  IF uid IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;
  SELECT coalesce(role, 'admin') INTO actor FROM public.team_users WHERE id = uid;

  IF TG_TABLE_NAME IN (
    'clients', 'suppliers', 'ingredients', 'recipes', 'recipe_ingredients', 'ingredient_prices'
  ) THEN
    IF TG_OP = 'DELETE' AND actor <> 'admin' THEN
      RAISE EXCEPTION 'No tienes permiso para esta acción';
    END IF;
    IF TG_OP = 'INSERT' AND actor = 'cocina' THEN
      RAISE EXCEPTION 'No tienes permiso para esta acción';
    END IF;
    IF TG_OP = 'UPDATE' AND actor = 'cocina' AND TG_TABLE_NAME <> 'ingredients' THEN
      RAISE EXCEPTION 'No tienes permiso para esta acción';
    END IF;
    IF TG_OP = 'UPDATE' AND actor = 'cocina' AND TG_TABLE_NAME = 'ingredients' THEN
      IF NEW.name IS DISTINCT FROM OLD.name
         OR NEW.unit IS DISTINCT FROM OLD.unit
         OR NEW.supplier_id IS DISTINCT FROM OLD.supplier_id
         OR NEW.unit_price IS DISTINCT FROM OLD.unit_price
         OR NEW.min_stock IS DISTINCT FROM OLD.min_stock
      THEN
        RAISE EXCEPTION 'No tienes permiso para esta acción';
      END IF;
    END IF;
  ELSIF TG_TABLE_NAME IN ('quotes', 'quote_payments', 'purchase_orders', 'purchase_order_items') THEN
    IF actor = 'cocina' THEN
      RAISE EXCEPTION 'No tienes permiso para esta acción';
    END IF;
  ELSIF TG_TABLE_NAME IN ('shopping_lists', 'shopping_list_items') THEN
    IF TG_OP IN ('UPDATE', 'DELETE') AND actor = 'cocina' THEN
      RAISE EXCEPTION 'No tienes permiso para esta acción';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients', 'suppliers', 'ingredients', 'recipes', 'recipe_ingredients', 'ingredient_prices',
    'quotes', 'quote_payments', 'shopping_lists', 'shopping_list_items',
    'purchase_orders', 'purchase_order_items'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS crm_enforce_role ON public.%I', t);
    EXECUTE format(
      'CREATE TRIGGER crm_enforce_role BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.crm_enforce_role()',
      t
    );
  END LOOP;
END $$;

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
  SELECT EXISTS (
    SELECT 1 FROM public.team_users WHERE email <> 'demo@cateringcrm.app'
  ) INTO has_real;
  uid := internal.current_team_user_id();
  IF uid IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.team_users WHERE recovery_hash IS NOT NULL
    ) INTO has_recovery;
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
    'hasRecovery', u.recovery_hash IS NOT NULL,
    'demoAvailable', NOT has_real
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_setup(
  p_name text,
  p_email text,
  p_password_salt text,
  p_password_hash text,
  p_recovery_salt text,
  p_recovery_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  email_norm text;
  u public.team_users%ROWTYPE;
  tok text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.team_users) THEN
    RAISE EXCEPTION 'El acceso del equipo ya está creado';
  END IF;
  IF btrim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;
  email_norm := lower(btrim(coalesce(p_email, '')));
  IF email_norm = '' OR position('@' in email_norm) = 0 THEN
    RAISE EXCEPTION 'Indica un email válido';
  END IF;
  IF length(coalesce(p_password_salt, '')) < 16 OR length(coalesce(p_password_hash, '')) < 32 THEN
    RAISE EXCEPTION 'La contraseña no es válida';
  END IF;
  INSERT INTO public.team_users (
    name, email, password_salt, password_hash, recovery_salt, recovery_hash
  )
  VALUES (
    btrim(p_name), email_norm, p_password_salt, p_password_hash, p_recovery_salt, p_recovery_hash
  )
  RETURNING * INTO u;
  tok := internal.create_session(u.id);
  RETURN internal.session_payload(u.id, u.email, u.name, tok);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_demo()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  u public.team_users%ROWTYPE;
  tok text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.team_users WHERE email <> 'demo@cateringcrm.app') THEN
    RAISE EXCEPTION 'El acceso de prueba está desactivado';
  END IF;
  SELECT * INTO u FROM public.team_users WHERE email = 'demo@cateringcrm.app';
  IF u.id IS NULL THEN
    INSERT INTO public.team_users (name, email, password_salt, password_hash)
    VALUES (
      'Prueba',
      'demo@cateringcrm.app',
      encode(extensions.gen_random_bytes(16), 'hex'),
      encode(extensions.gen_random_bytes(32), 'hex')
    )
    RETURNING * INTO u;
  END IF;
  tok := internal.create_session(u.id);
  RETURN internal.session_payload(u.id, u.email, u.name, tok);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_add_user(
  p_name text,
  p_email text,
  p_password_salt text,
  p_password_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  email_norm text;
  u public.team_users%ROWTYPE;
BEGIN
  PERFORM internal.require_admin();
  IF btrim(coalesce(p_name, '')) = '' THEN
    RAISE EXCEPTION 'El nombre es obligatorio';
  END IF;
  email_norm := lower(btrim(coalesce(p_email, '')));
  IF email_norm = '' OR position('@' in email_norm) = 0 THEN
    RAISE EXCEPTION 'Indica un email válido';
  END IF;
  IF EXISTS (SELECT 1 FROM public.team_users WHERE email = email_norm) THEN
    RAISE EXCEPTION 'Ese email ya tiene acceso';
  END IF;
  INSERT INTO public.team_users (name, email, password_salt, password_hash)
  VALUES (btrim(p_name), email_norm, p_password_salt, p_password_hash)
  RETURNING * INTO u;
  RETURN jsonb_build_object('user', internal.public_user(u.id, u.email, u.name, u.role));
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_delete_user(p_user_id integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  me integer;
BEGIN
  me := internal.require_admin();
  IF p_user_id = me THEN
    RAISE EXCEPTION 'No puedes quitarte a ti mismo';
  END IF;
  IF (SELECT count(*) FROM public.team_users) <= 1 THEN
    RAISE EXCEPTION 'Debe quedar al menos una persona con acceso';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;
  DELETE FROM public.team_users WHERE id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_reset_password(
  p_user_id integer,
  p_new_salt text,
  p_new_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  me integer;
BEGIN
  me := internal.require_admin();
  IF p_user_id = me THEN
    RAISE EXCEPTION 'Para tu contraseña usa Cambiar mi contraseña';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.team_users WHERE id = p_user_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado';
  END IF;
  UPDATE public.team_users
  SET password_salt = p_new_salt, password_hash = p_new_hash, updated_at = now()
  WHERE id = p_user_id;
  DELETE FROM public.team_sessions WHERE user_id = p_user_id;
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_change_password(
  p_current_hash text,
  p_new_salt text,
  p_new_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  uid integer;
  u public.team_users%ROWTYPE;
  tok text;
BEGIN
  uid := internal.current_team_user_id();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
  SELECT * INTO u FROM public.team_users WHERE id = uid;
  IF u.password_hash IS DISTINCT FROM p_current_hash THEN
    RAISE EXCEPTION 'La contraseña actual no es correcta';
  END IF;
  UPDATE public.team_users
  SET password_salt = p_new_salt, password_hash = p_new_hash, updated_at = now()
  WHERE id = uid;
  DELETE FROM public.team_sessions WHERE user_id = uid;
  tok := internal.create_session(uid);
  RETURN internal.session_payload(u.id, u.email, u.name, tok);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_set_recovery(p_code_salt text, p_code_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  uid integer;
BEGIN
  uid := internal.current_team_user_id();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
  UPDATE public.team_users
  SET recovery_salt = p_code_salt, recovery_hash = p_code_hash, updated_at = now()
  WHERE id = uid;
  RETURN jsonb_build_object('ok', true);
END;
$$;

DROP FUNCTION IF EXISTS public.crm_auth_recovery_salt();

CREATE OR REPLACE FUNCTION public.crm_auth_recovery_salt(p_email text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  email_norm text;
  salt text;
BEGIN
  email_norm := lower(btrim(coalesce(p_email, '')));
  SELECT recovery_salt INTO salt FROM public.team_users WHERE email = email_norm;
  IF salt IS NULL THEN
    salt := substring(
      encode(extensions.digest(convert_to('crm-dummy-recovery' || email_norm, 'UTF8'), 'sha256'), 'hex')
      FROM 1 FOR 32
    );
  END IF;
  RETURN jsonb_build_object('salt', salt);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_recover(
  p_email text,
  p_code_hash text,
  p_new_salt text,
  p_new_hash text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  email_norm text;
  u public.team_users%ROWTYPE;
  tok text;
BEGIN
  email_norm := lower(btrim(coalesce(p_email, '')));
  SELECT * INTO u FROM public.team_users WHERE email = email_norm;
  IF u.id IS NULL OR u.recovery_hash IS NULL OR u.recovery_hash IS DISTINCT FROM p_code_hash THEN
    RAISE EXCEPTION 'Email o código incorrectos';
  END IF;
  UPDATE public.team_users
  SET password_salt = p_new_salt, password_hash = p_new_hash, updated_at = now()
  WHERE id = u.id;
  DELETE FROM public.team_sessions WHERE user_id = u.id;
  tok := internal.create_session(u.id);
  RETURN internal.session_payload(u.id, u.email, u.name, tok);
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
    'validUntil', q.valid_until,
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
  today date;
  until_day date;
BEGIN
  SELECT * INTO q FROM public.quotes WHERE public_token = p_token;
  IF q.id IS NULL THEN
    RAISE EXCEPTION 'Cotización no encontrada';
  END IF;
  IF q.valid_until IS NOT NULL THEN
    today := (now() AT TIME ZONE 'America/Santiago')::date;
    until_day := (q.valid_until AT TIME ZONE 'America/Santiago')::date;
    IF until_day < today THEN
      RAISE EXCEPTION 'Esta cotización ya no está vigente';
    END IF;
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

REVOKE ALL ON FUNCTION internal.require_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_enforce_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION internal.session_payload(integer, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_recovery_salt(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_demo() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_quote_public(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_quote_public_respond(text, text) TO anon, authenticated;
