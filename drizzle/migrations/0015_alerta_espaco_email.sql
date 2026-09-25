CREATE OR REPLACE FUNCTION public.medir_espaco_banco()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_alertas int;
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

  SELECT count(*) INTO v_alertas FROM public.monitor_espaco_tabelas WHERE medido_em = now() AND alerta;
  IF v_alertas > 0 THEN
    BEGIN
      PERFORM net.http_post(
        url := 'https://ddcglijsqqiaulmfadxh.supabase.co/functions/v1/alerta-espaco-banco',
        headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkY2dsaWpzcXFpYXVsbWZhZHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MDg3NDYsImV4cCI6MjA4NTM4NDc0Nn0.nuEFYPTWTaUjjt8Q3sVyfYb7o6n_2HBCxMDWtJ_fQ8M"}'::jsonb,
        body := '{}'::jsonb
      );
    EXCEPTION WHEN others THEN
      RAISE WARNING 'alerta-espaco-banco: falha ao disparar: %', SQLERRM;
    END;
  END IF;
END $function$;