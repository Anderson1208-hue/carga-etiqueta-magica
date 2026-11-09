-- lovable-cron-fallback-reviewed: retry job only exists after a failed run, max 4 runs, unscheduled on success or after 5th attempt
CREATE TABLE public.integracao_tentativas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integracao text NOT NULL CHECK (integracao IN ('okentrega','ibac')),
  tentativa int NOT NULL,
  sucesso boolean NOT NULL,
  http_status int,
  erro text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.integracao_tentativas TO authenticated;
GRANT ALL ON public.integracao_tentativas TO service_role;
ALTER TABLE public.integracao_tentativas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operadores leem tentativas" ON public.integracao_tentativas FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));
CREATE INDEX ON public.integracao_tentativas (integracao, created_at DESC);

CREATE OR REPLACE FUNCTION public.integracao_disparar(p_integracao text, p_tentativa int)
RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT net.http_post(
    url := 'https://ddcglijsqqiaulmfadxh.supabase.co/functions/v1/integracao-guardiao',
    headers := jsonb_build_object('Content-Type','application/json','x-okentrega-cron',(SELECT token::text FROM public.okentrega_cron_auth WHERE id=true)),
    body := jsonb_build_object('integracao', p_integracao, 'tentativa', p_tentativa),
    timeout_milliseconds := 30000);
$$;

CREATE OR REPLACE FUNCTION public.integracao_retry_agendar(p_integracao text, p_tentativa int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_integracao NOT IN ('okentrega','ibac') OR p_tentativa NOT BETWEEN 2 AND 5 THEN RAISE EXCEPTION 'parametro invalido'; END IF;
  PERFORM cron.schedule('retry-integracao-'||p_integracao, '*/10 * * * *',
    format('SELECT public.integracao_disparar(%L, %s)', p_integracao, p_tentativa));
END $$;

CREATE OR REPLACE FUNCTION public.integracao_retry_cancelar(p_integracao text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='retry-integracao-'||p_integracao) THEN
    PERFORM cron.unschedule('retry-integracao-'||p_integracao);
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.integracao_disparar(text,int), public.integracao_retry_agendar(text,int), public.integracao_retry_cancelar(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.integracao_disparar(text,int), public.integracao_retry_agendar(text,int), public.integracao_retry_cancelar(text) TO service_role;