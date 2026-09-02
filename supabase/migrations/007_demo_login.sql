-- Acceso de prueba sin contraseña (crm_auth_demo).
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
      'hasRecovery', has_recovery,
      'demoAvailable', true
    );
  END IF;
  SELECT * INTO u FROM public.team_users WHERE id = uid;
  RETURN jsonb_build_object(
    'configured', configured,
    'user', internal.public_user(u.id, u.email, u.name),
    'hasRecovery', has_recovery,
    'demoAvailable', true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.crm_auth_demo() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.crm_auth_demo() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_auth_status() TO anon, authenticated;
