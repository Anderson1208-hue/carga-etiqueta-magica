CREATE POLICY "agente anexos insert proprio" ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'agente-anexos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.pode_agente_gerencial()));
CREATE POLICY "agente anexos select proprio" ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'agente-anexos' AND (storage.foldername(name))[1] = (SELECT auth.uid())::text AND (SELECT public.pode_agente_gerencial()));

CREATE OR REPLACE FUNCTION public.agente_cruzar_nfs(p_nfs text[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' SET statement_timeout TO '20s'
AS $$
DECLARE v jsonb;
BEGIN
  IF NOT (SELECT public.pode_agente_gerencial()) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
  IF p_nfs IS NULL OR cardinality(p_nfs) = 0 OR cardinality(p_nfs) > 2000 THEN RAISE EXCEPTION 'Informe de 1 a 2000 notas'; END IF;
  WITH notas AS (
    SELECT d.dados->>'nf' nf, max(d.dados->>'embarcador') embarcador, max(d.dados->>'cliente') cliente, max(d.dados->>'cidade') cidade,
      max(d.dados->>'emissao') emissao, max(d.dados->>'status') status, max(d.dados->>'agenda_data') agenda_data, max(d.dados->>'roteirizacao_data') roteirizacao_data
    FROM public.agente_gerencial_dados d WHERE d.dataset='notas' AND d.dados->>'nf' = ANY(p_nfs) GROUP BY 1
  ), ent AS (
    SELECT d.dados->>'nf' nf, max(((d.dados->>'data')::timestamptz AT TIME ZONE 'America/Sao_Paulo')::date) FILTER (WHERE lower(d.dados->>'status')='entregue') entrega_data,
      max(d.dados->>'validacao_status') validacao_status
    FROM public.agente_gerencial_dados d WHERE d.dataset='entregas' AND d.dados->>'nf' = ANY(p_nfs) GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('nf',x.nf,'encontrada',n.nf IS NOT NULL,'embarcador',n.embarcador,'cliente',n.cliente,'cidade',n.cidade,'emissao',n.emissao,'status',n.status,'agenda_data',n.agenda_data,'roteirizacao_data',n.roteirizacao_data,'entrega_data',e.entrega_data,'validacao_status',e.validacao_status) ORDER BY x.nf),'[]'::jsonb)
  INTO v FROM (SELECT DISTINCT unnest(p_nfs) nf) x LEFT JOIN notas n ON n.nf=x.nf LEFT JOIN ent e ON e.nf=x.nf;
  RETURN v;
END $$;
REVOKE ALL ON FUNCTION public.agente_cruzar_nfs(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.agente_cruzar_nfs(text[]) TO authenticated;