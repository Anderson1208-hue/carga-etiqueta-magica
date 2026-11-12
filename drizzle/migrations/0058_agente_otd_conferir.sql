CREATE OR REPLACE FUNCTION public.agente_otd_conferir(p_nfs text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '20s'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (SELECT public.pode_agente_gerencial()) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
  IF p_nfs IS NULL OR cardinality(p_nfs) = 0 OR cardinality(p_nfs) > 5000 THEN RAISE EXCEPTION 'Informe de 1 a 5000 notas'; END IF;
  WITH notas AS (
    SELECT d.dados->>'nf' nf, max(d.dados->>'agenda_data') agenda_data, max(d.dados->>'status') status
    FROM public.agente_gerencial_dados d
    WHERE d.dataset='notas' AND d.dados->>'nf' = ANY(p_nfs)
      AND (d.dados->>'embarcador' ILIKE '%bauducco%' OR d.dados->>'embarcador' ILIKE '%pandurata%')
    GROUP BY 1
  ), ent AS (
    SELECT d.dados->>'nf' nf, max(((d.dados->>'data')::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date) entrega_data
    FROM public.agente_gerencial_dados d
    WHERE d.dataset='entregas' AND d.dados->>'nf' = ANY(p_nfs) AND lower(d.dados->>'status')='entregue'
      AND (d.dados->>'embarcador' ILIKE '%bauducco%' OR d.dados->>'embarcador' ILIKE '%pandurata%')
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('nf',n.nf,'agenda_data',n.agenda_data,'status',n.status,'entrega_data',e.entrega_data)),'[]'::jsonb)
  INTO v FROM notas n LEFT JOIN ent e ON e.nf=n.nf;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.agente_otd_conferir(text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.agente_otd_conferir(text[]) TO authenticated;