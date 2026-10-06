-- El enlace público muestra las versiones del evento y no acepta una reemplazada.
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
  history jsonb;
  replaced boolean;
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
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'version', s.version,
    'quoteDate', s.quote_date,
    'total', s.total,
    'status', s.status
  ) ORDER BY s.version), '[]'::jsonb)
  INTO history
  FROM public.quotes s
  WHERE s.event_id = q.event_id;
  replaced := EXISTS (
    SELECT 1 FROM public.quotes s
    WHERE s.event_id = q.event_id AND s.version > q.version
  );
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
    'superseded', replaced,
    'history', history,
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
  IF q.status IN ('aceptada', 'rechazada') THEN
    RAISE EXCEPTION 'Esta cotización ya fue respondida';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.quotes s
    WHERE s.event_id = q.event_id AND s.version > q.version
  ) THEN
    RAISE EXCEPTION 'Esta versión fue reemplazada. Pide el enlace de la más nueva.';
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

GRANT EXECUTE ON FUNCTION public.crm_quote_public(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_quote_public_respond(text, text) TO anon, authenticated;
