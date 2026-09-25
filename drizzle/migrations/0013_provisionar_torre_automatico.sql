-- lovable-cron-fallback-reviewed: usuario autorizou verificacao a cada 10 min como rede de seguranca; consulta leve e idempotente
DO $do$
DECLARE v_def text;
BEGIN
  v_def := pg_get_functiondef('public.provisionar_torre_veiculo(uuid)'::regprocedure);
  v_def := replace(v_def,
    'IF NOT (public.is_admin() OR public.is_active_operator()) THEN',
    'IF NOT (public.is_admin() OR public.is_active_operator() OR coalesce(auth.role(),'''') = ''service_role'' OR session_user = ''postgres'') THEN');
  EXECUTE v_def;
END
$do$;

CREATE OR REPLACE FUNCTION public.provisionar_torre_sistema()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '120s'
AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_id uuid;
  v_res jsonb;
  v_criadas int := 0;
BEGIN
  IF NOT (coalesce(auth.role(),'') = 'service_role' OR session_user = 'postgres') THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  FOR v_id IN
    SELECT v.id FROM public.veiculos v
     WHERE v.data = v_hoje
       AND v.status IN ('pendente','em_rota')
       AND v.prestacao_contas_em IS NULL
       AND EXISTS (SELECT 1 FROM public.veiculo_nfs vn WHERE vn.veiculo_id = v.id)
       AND NOT EXISTS (SELECT 1 FROM public.monitoramento_rotas r WHERE r.veiculo_id = v.id)
  LOOP
    v_res := public.provisionar_torre_veiculo(v_id);
    IF v_res->>'status' = 'ok' THEN v_criadas := v_criadas + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('data', v_hoje, 'criadas', v_criadas);
END;
$$;

REVOKE ALL ON FUNCTION public.provisionar_torre_sistema() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.provisionar_torre_sistema() TO service_role;

CREATE EXTENSION IF NOT EXISTS pg_cron;
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'provisionar-torre-10min';
SELECT cron.schedule('provisionar-torre-10min', '*/10 * * * *', $$SELECT public.provisionar_torre_sistema();$$);