ALTER TABLE public.agente_gerencial_conversas ADD COLUMN execucao_token uuid;
CREATE OR REPLACE FUNCTION public.pode_agente_gerencial() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT (SELECT public.is_active_operator()) AND ((SELECT public.is_admin()) OR (auth.uid()='e847b0ab-5e6f-417e-8115-6d2c67a3697f'::uuid AND EXISTS (SELECT 1 FROM public.agente_gerencial_acessos WHERE user_id=auth.uid()))) $$;
CREATE FUNCTION public.agente_gerencial_reservar_execucao(p_conversa uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_token uuid;
BEGIN
IF NOT (SELECT public.pode_agente_gerencial()) THEN RETURN NULL; END IF;
UPDATE public.agente_gerencial_conversas SET executando_em=now(),execucao_token=gen_random_uuid() WHERE id=p_conversa AND user_id=auth.uid() AND (executando_em IS NULL OR executando_em<now()-interval '10 minutes') RETURNING execucao_token INTO v_token;
RETURN v_token;
END $$;
REVOKE ALL ON FUNCTION public.agente_gerencial_reservar_execucao(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agente_gerencial_reservar_execucao(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.agente_gerencial_reservar(uuid) FROM authenticated;
CREATE VIEW public.agente_gerencial_catalogos AS
SELECT 'sla'::text dataset,s.id::text row_id,jsonb_build_object('embarcador',e.razao_social,'regiao',r.nome,'prazo_dias_uteis',s.prazo_dias_uteis,'vigente_de',s.vigente_de,'vigente_ate',s.vigente_ate,'ativo',s.ativo) dados FROM public.embarcador_regiao_sla s JOIN public.embarcador_regioes r ON r.id=s.regiao_id JOIN public.embarcadores e ON e.id=r.embarcador_id
UNION ALL SELECT 'tarifas',t.id::text,jsonb_build_object('embarcador',e.razao_social,'regiao',r.nome,'tarifa_por_ton',t.tarifa_por_ton,'tarifa_fixa',t.tarifa_fixa,'frete_minimo',t.frete_minimo,'gris_percentual',t.gris_percentual,'advalorem_percentual',t.advalorem_percentual,'pedagio_por_100kg',t.pedagio_por_100kg,'adicional_cte',t.adicional_cte,'vigente_de',t.vigente_de,'vigente_ate',t.vigente_ate,'ativo',t.ativo) FROM public.embarcador_regiao_tarifas t JOIN public.embarcador_regioes r ON r.id=t.regiao_id JOIN public.embarcadores e ON e.id=r.embarcador_id;
REVOKE ALL ON public.agente_gerencial_catalogos FROM PUBLIC,anon,authenticated;
CREATE FUNCTION public.agente_gerencial_relatorio(p_conversa uuid,p_token uuid,p_dataset text,p_inicio date,p_fim date,p_filtros jsonb DEFAULT '{}'::jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public SET statement_timeout='15s' AS $$
DECLARE v_result jsonb;
BEGIN
IF NOT (SELECT public.pode_agente_gerencial()) OR NOT EXISTS(SELECT 1 FROM public.agente_gerencial_conversas WHERE id=p_conversa AND user_id=auth.uid() AND execucao_token=p_token AND executando_em>now()-interval '10 minutes') THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
IF p_inicio IS NULL OR p_fim IS NULL OR p_fim<p_inicio OR p_fim-p_inicio>366 OR p_dataset IS NULL OR p_dataset NOT IN ('notas','cargas','veiculos','agendas','entregas','ibac','okentrega','produtos','destinatarios','embarcadores','roteirizacoes','prefaturas','prefatura_itens','ctes','sla','tarifas') OR p_filtros IS NULL OR jsonb_typeof(p_filtros)<>'object' THEN RAISE EXCEPTION 'Consulta inválida'; END IF;
IF EXISTS(SELECT 1 FROM jsonb_each_text(p_filtros) WHERE key NOT IN ('nf','placa','cliente','embarcador','status','validacao_status','cidade','codigo','agenda_status','roteirizacao_data','emissao','regiao') OR length(value)>120 OR value IS NULL) THEN RAISE EXCEPTION 'Filtro não autorizado'; END IF;
WITH candidates AS (
SELECT d.row_id,d.dados FROM public.agente_gerencial_dados d WHERE d.dataset=p_dataset AND (p_dataset IN ('produtos','destinatarios','embarcadores') OR (CASE WHEN p_dataset IN ('cargas','veiculos','agendas','prefaturas') THEN coalesce((d.dados->>'data')::timestamp AT TIME ZONE 'America/Sao_Paulo',d.data_ref) ELSE d.data_ref END >= (p_inicio::timestamp AT TIME ZONE 'America/Sao_Paulo') AND CASE WHEN p_dataset IN ('cargas','veiculos','agendas','prefaturas') THEN coalesce((d.dados->>'data')::timestamp AT TIME ZONE 'America/Sao_Paulo',d.data_ref) ELSE d.data_ref END < ((p_fim+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')))
UNION ALL SELECT c.row_id,c.dados FROM public.agente_gerencial_catalogos c WHERE c.dataset=p_dataset
), selected AS (SELECT d.row_id,d.dados FROM candidates d WHERE NOT EXISTS(SELECT 1 FROM jsonb_each_text(p_filtros) f WHERE CASE WHEN f.key IN ('nf','placa','codigo','roteirizacao_data','emissao') THEN lower(coalesce(d.dados->>f.key,''))<>lower(f.value) ELSE position(lower(f.value) in lower(coalesce(d.dados->>f.key,'')))=0 END) ORDER BY d.row_id LIMIT 5001), numbered AS (SELECT dados,row_number() OVER(ORDER BY row_id) rn FROM selected)
SELECT jsonb_build_object('rows',coalesce(jsonb_agg(dados ORDER BY rn) FILTER(WHERE rn<=5000),'[]'::jsonb),'complete',count(*)<=5000,'catalog',p_dataset IN ('produtos','destinatarios','embarcadores','sla','tarifas')) INTO v_result FROM numbered;
RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.agente_gerencial_relatorio(uuid,uuid,text,date,date,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.agente_gerencial_relatorio(uuid,uuid,text,date,date,jsonb) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.agente_gerencial_consultar(text,date,date,jsonb,integer) FROM authenticated;