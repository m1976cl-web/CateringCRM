-- RLS de equipo: las tablas del CRM exigen sesión; auth va por RPC (sin exponer hashes).
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE SCHEMA IF NOT EXISTS internal;
REVOKE ALL ON SCHEMA internal FROM PUBLIC;
GRANT USAGE ON SCHEMA internal TO anon, authenticated;

CREATE OR REPLACE FUNCTION internal.request_token()
RETURNS text
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  raw text;
BEGIN
  raw := current_setting('request.headers', true);
  IF raw IS NULL OR raw = '' THEN
    RETURN NULL;
  END IF;
  RETURN NULLIF(btrim(raw::json->>'x-team-token'), '');
EXCEPTION
  WHEN others THEN
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION internal.hash_token(tok text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT encode(extensions.digest(convert_to(tok, 'UTF8'), 'sha256'), 'hex');
$$;

CREATE OR REPLACE FUNCTION internal.current_team_user_id()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
  SELECT s.user_id
  FROM public.team_sessions s
  WHERE s.token_hash = internal.hash_token(internal.request_token())
    AND s.expires_at > now()
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.crm_is_team_member()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
  SELECT internal.current_team_user_id() IS NOT NULL;
$$;

REVOKE ALL ON FUNCTION public.crm_is_team_member() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_is_team_member() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.current_team_user_id() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.request_token() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION internal.hash_token(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION internal.create_session(p_user_id integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  tok text;
BEGIN
  tok := encode(extensions.gen_random_bytes(32), 'hex');
  INSERT INTO public.team_sessions (user_id, token_hash, expires_at)
  VALUES (
    p_user_id,
    internal.hash_token(tok),
    now() + interval '30 days'
  );
  RETURN tok;
END;
$$;

CREATE OR REPLACE FUNCTION internal.public_user(p_id integer, p_email text, p_name text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object('id', p_id, 'email', p_email, 'name', p_name);
$$;

CREATE OR REPLACE FUNCTION internal.session_payload(p_id integer, p_email text, p_name text, p_token text)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT jsonb_build_object(
    'user', internal.public_user(p_id, p_email, p_name),
    'token', p_token
  );
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
BEGIN
  SELECT EXISTS (SELECT 1 FROM public.team_users) INTO configured;
  SELECT EXISTS (SELECT 1 FROM public.team_recovery) INTO has_recovery;
  uid := internal.current_team_user_id();
  IF uid IS NULL THEN
    RETURN jsonb_build_object(
      'configured', configured,
      'user', NULL,
      'hasRecovery', has_recovery
    );
  END IF;
  SELECT * INTO u FROM public.team_users WHERE id = uid;
  RETURN jsonb_build_object(
    'configured', configured,
    'user', internal.public_user(u.id, u.email, u.name),
    'hasRecovery', has_recovery
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
  INSERT INTO public.team_users (name, email, password_salt, password_hash)
  VALUES (btrim(p_name), email_norm, p_password_salt, p_password_hash)
  RETURNING * INTO u;
  DELETE FROM public.team_recovery;
  INSERT INTO public.team_recovery (code_salt, code_hash)
  VALUES (p_recovery_salt, p_recovery_hash);
  tok := internal.create_session(u.id);
  RETURN internal.session_payload(u.id, u.email, u.name, tok);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_login_salt(p_email text)
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
  SELECT password_salt INTO salt FROM public.team_users WHERE email = email_norm;
  IF salt IS NULL THEN
    salt := substring(
      encode(extensions.digest(convert_to('crm-dummy-salt' || email_norm, 'UTF8'), 'sha256'), 'hex')
      FROM 1 FOR 32
    );
  END IF;
  RETURN jsonb_build_object('salt', salt);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_login(p_email text, p_password_hash text)
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
  IF NOT FOUND OR u.password_hash IS DISTINCT FROM p_password_hash THEN
    RAISE EXCEPTION 'Email o contraseña incorrectos';
  END IF;
  tok := internal.create_session(u.id);
  RETURN internal.session_payload(u.id, u.email, u.name, tok);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_logout()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  tok text;
BEGIN
  tok := internal.request_token();
  IF tok IS NOT NULL THEN
    DELETE FROM public.team_sessions WHERE token_hash = internal.hash_token(tok);
  END IF;
  RETURN jsonb_build_object('ok', true);
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
      SELECT jsonb_agg(internal.public_user(id, email, name) ORDER BY id)
      FROM public.team_users
    ),
    '[]'::jsonb
  );
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
  IF internal.current_team_user_id() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
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
  RETURN jsonb_build_object('user', internal.public_user(u.id, u.email, u.name));
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_password_salt()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  uid integer;
  salt text;
BEGIN
  uid := internal.current_team_user_id();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
  SELECT password_salt INTO salt FROM public.team_users WHERE id = uid;
  RETURN jsonb_build_object('salt', salt);
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
  RETURN jsonb_build_object('ok', true);
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
  me := internal.current_team_user_id();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
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
  me := internal.current_team_user_id();
  IF me IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
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

CREATE OR REPLACE FUNCTION public.crm_auth_set_recovery(p_code_salt text, p_code_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
BEGIN
  IF internal.current_team_user_id() IS NULL THEN
    RAISE EXCEPTION 'Inicia sesión para continuar';
  END IF;
  DELETE FROM public.team_recovery;
  INSERT INTO public.team_recovery (code_salt, code_hash)
  VALUES (p_code_salt, p_code_hash);
  RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.crm_auth_recovery_salt()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, internal
AS $$
DECLARE
  salt text;
BEGIN
  SELECT code_salt INTO salt FROM public.team_recovery LIMIT 1;
  IF salt IS NULL THEN
    salt := substring(
      encode(extensions.digest(convert_to('crm-dummy-recovery', 'UTF8'), 'sha256'), 'hex')
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
  rec public.team_recovery%ROWTYPE;
  tok text;
BEGIN
  email_norm := lower(btrim(coalesce(p_email, '')));
  SELECT * INTO u FROM public.team_users WHERE email = email_norm;
  SELECT * INTO rec FROM public.team_recovery LIMIT 1;
  IF u.id IS NULL OR rec.id IS NULL OR rec.code_hash IS DISTINCT FROM p_code_hash THEN
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

REVOKE ALL ON FUNCTION public.crm_auth_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_setup(text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_login_salt(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_login(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_logout() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_add_user(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_password_salt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_change_password(text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_delete_user(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_reset_password(integer, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_set_recovery(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_recovery_salt() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.crm_auth_recover(text, text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.crm_auth_status() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_setup(text, text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_login_salt(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_login(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_logout() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_users() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_add_user(text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_password_salt() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_change_password(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_delete_user(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_reset_password(integer, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_set_recovery(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_recovery_salt() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_recover(text, text, text, text) TO anon, authenticated;

REVOKE ALL ON TABLE public.team_users FROM anon, authenticated;
REVOKE ALL ON TABLE public.team_sessions FROM anon, authenticated;
REVOKE ALL ON TABLE public.team_recovery FROM anon, authenticated;

DROP POLICY IF EXISTS "v1_anon_all" ON public.team_users;
DROP POLICY IF EXISTS "v1_anon_all" ON public.team_sessions;
DROP POLICY IF EXISTS "v1_anon_all" ON public.team_recovery;

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'clients', 'suppliers', 'ingredients', 'recipes', 'recipe_ingredients',
    'events', 'event_services', 'event_recipes', 'quotes', 'quote_payments',
    'shopping_lists', 'shopping_list_items'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "v1_anon_all" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "team_session_all" ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY "team_session_all" ON public.%I FOR ALL TO anon, authenticated USING (public.crm_is_team_member()) WITH CHECK (public.crm_is_team_member())',
      t
    );
  END LOOP;
END $$;

ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
