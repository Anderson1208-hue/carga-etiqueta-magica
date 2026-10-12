CREATE OR REPLACE FUNCTION public.purgar_etiquetas_entregues(_lote integer DEFAULT 5000)
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE n int; m int;
BEGIN
  -- Regra 1: todas as etiquetas de NFs com baixa "entregue" há mais de 30 dias
  WITH ult AS (
    SELECT DISTINCT ON (nf_id) nf_id, status, registrado_em
    FROM public.baixas_entrega ORDER BY nf_id, registrado_em DESC NULLS LAST
  ), alvo AS (
    SELECT e.id FROM public.etiquetas e JOIN ult u ON u.nf_id = e.nf_id
    WHERE u.status = 'entregue' AND u.registrado_em < now() - interval '30 days'
    LIMIT _lote
  )
  DELETE FROM public.etiquetas e USING alvo WHERE e.id = alvo.id;
  GET DIAGNOSTICS n = ROW_COUNT;

  -- Regra 2: etiquetas nunca bipadas (pendente) de NFs já ENTREGUES,
  -- com margem de 7 dias desde a última baixa (proteção p/ baixa desfeita)
  WITH alvo AS (
    SELECT e.id FROM public.etiquetas e
    JOIN public.notas_fiscais nf ON nf.id = e.nf_id
    WHERE e.status = 'pendente' AND nf.status_entrega = 'ENTREGUE'
      AND NOT EXISTS (SELECT 1 FROM public.baixas_entrega b
                      WHERE b.nf_id = e.nf_id AND b.registrado_em >= now() - interval '7 days')
    LIMIT _lote
  )
  DELETE FROM public.etiquetas e USING alvo WHERE e.id = alvo.id;
  GET DIAGNOSTICS m = ROW_COUNT;
  RETURN n + m;
END $function$;