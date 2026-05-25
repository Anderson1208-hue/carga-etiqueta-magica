
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION public.fn_trigger_validar_canhoto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_url text := 'https://ddcglijsqqiaulmfadxh.supabase.co/functions/v1/validar-canhoto';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkY2dsaWpzcXFpYXVsbWZhZHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MDg3NDYsImV4cCI6MjA4NTM4NDc0Nn0.nuEFYPTWTaUjjt8Q3sVyfYb7o6n_2HBCxMDWtJ_fQ8M';
BEGIN
  IF NEW.foto_path IS NOT NULL
     AND NEW.status = 'entregue'
     AND NEW.validacao_status IS NULL THEN
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer '||v_anon
      ),
      body := jsonb_build_object('baixa_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.fn_trigger_validar_canhoto() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS trg_validar_canhoto_ins ON public.baixas_entrega;
CREATE TRIGGER trg_validar_canhoto_ins
AFTER INSERT ON public.baixas_entrega
FOR EACH ROW EXECUTE FUNCTION public.fn_trigger_validar_canhoto();

DROP TRIGGER IF EXISTS trg_validar_canhoto_upd ON public.baixas_entrega;
CREATE TRIGGER trg_validar_canhoto_upd
AFTER UPDATE OF foto_path ON public.baixas_entrega
FOR EACH ROW
WHEN (NEW.foto_path IS DISTINCT FROM OLD.foto_path)
EXECUTE FUNCTION public.fn_trigger_validar_canhoto();

DO $$
DECLARE
  r record;
  v_url text := 'https://ddcglijsqqiaulmfadxh.supabase.co/functions/v1/validar-canhoto';
  v_anon text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkY2dsaWpzcXFpYXVsbWZhZHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MDg3NDYsImV4cCI6MjA4NTM4NDc0Nn0.nuEFYPTWTaUjjt8Q3sVyfYb7o6n_2HBCxMDWtJ_fQ8M';
BEGIN
  FOR r IN
    SELECT id FROM public.baixas_entrega
    WHERE foto_path IS NOT NULL
      AND status = 'entregue'
      AND validacao_status IS NULL
    ORDER BY registrado_em DESC
    LIMIT 200
  LOOP
    PERFORM net.http_post(
      url := v_url,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer '||v_anon
      ),
      body := jsonb_build_object('baixa_id', r.id)
    );
  END LOOP;
END $$;
