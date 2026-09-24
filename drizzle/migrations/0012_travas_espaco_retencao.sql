CREATE OR REPLACE FUNCTION public.purgar_etiquetas_entregues(_lote int DEFAULT 5000)
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH ult AS (
    SELECT DISTINCT ON (nf_id) nf_id, status, registrado_em
    FROM public.baixas_entrega
    ORDER BY nf_id, registrado_em DESC NULLS LAST
  ), alvo AS (
    SELECT e.id FROM public.etiquetas e
    JOIN ult u ON u.nf_id = e.nf_id
    WHERE u.status = 'entregue' AND u.registrado_em < now() - interval '30 days'
    LIMIT _lote
  )
  DELETE FROM public.etiquetas e USING alvo WHERE e.id = alvo.id;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.purgar_etiquetas_entregues(int) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reter_logs_tecnicos()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.ibac_log_envios SET request_body = NULL, response_body = NULL
   WHERE created_at < now() - interval '90 days' AND (request_body IS NOT NULL OR response_body IS NOT NULL);
  UPDATE public.okentrega_log_envios SET request_body = NULL, response_body = NULL
   WHERE created_at < now() - interval '90 days' AND (request_body IS NOT NULL OR response_body IS NOT NULL);
END $$;
REVOKE ALL ON FUNCTION public.reter_logs_tecnicos() FROM PUBLIC, anon, authenticated;

CREATE TABLE public.monitor_espaco_tabelas (
  id bigserial PRIMARY KEY,
  medido_em timestamptz NOT NULL DEFAULT now(),
  tabela text NOT NULL,
  bytes bigint NOT NULL,
  alerta boolean NOT NULL DEFAULT false,
  motivo text
);
GRANT SELECT ON public.monitor_espaco_tabelas TO authenticated;
GRANT ALL ON public.monitor_espaco_tabelas TO service_role;
ALTER TABLE public.monitor_espaco_tabelas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem monitor espaco" ON public.monitor_espaco_tabelas FOR SELECT TO authenticated USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.medir_espaco_banco()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.monitor_espaco_tabelas (tabela, bytes, alerta, motivo)
  SELECT c.relname, pg_total_relation_size(c.oid),
         (prev.bytes IS NOT NULL AND pg_total_relation_size(c.oid) > prev.bytes * 1.3 AND pg_total_relation_size(c.oid) > 100*1024*1024),
         CASE WHEN prev.bytes IS NOT NULL AND pg_total_relation_size(c.oid) > prev.bytes * 1.3 AND pg_total_relation_size(c.oid) > 100*1024*1024
              THEN 'Cresceu mais de 30% em 1 dia' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  LEFT JOIN LATERAL (SELECT m.bytes FROM public.monitor_espaco_tabelas m WHERE m.tabela = c.relname ORDER BY m.medido_em DESC LIMIT 1) prev ON true
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND pg_total_relation_size(c.oid) > 10*1024*1024;
  INSERT INTO public.monitor_espaco_tabelas (tabela, bytes, alerta, motivo)
  SELECT '_banco_total', pg_database_size(current_database()),
         pg_database_size(current_database()) > 8::bigint*1024*1024*1024,
         CASE WHEN pg_database_size(current_database()) > 8::bigint*1024*1024*1024 THEN 'Banco acima de 8 GB' END;
  DELETE FROM public.monitor_espaco_tabelas WHERE medido_em < now() - interval '180 days';
END $$;
REVOKE ALL ON FUNCTION public.medir_espaco_banco() FROM PUBLIC, anon, authenticated;

SELECT cron.schedule('purgar-etiquetas-entregues', '*/10 5-8 * * *', $c$SELECT public.purgar_etiquetas_entregues(5000);$c$);
SELECT cron.schedule('reter-logs-tecnicos', '30 6 * * *', $c$SELECT public.reter_logs_tecnicos();$c$);
SELECT cron.schedule('medir-espaco-banco', '0 7 * * *', $c$SELECT public.medir_espaco_banco();$c$);