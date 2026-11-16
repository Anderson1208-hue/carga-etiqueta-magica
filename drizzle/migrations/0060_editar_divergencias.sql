ALTER TABLE public.divergencias_recebimento ADD COLUMN anterior_id uuid REFERENCES public.divergencias_recebimento(id), ADD COLUMN alteracao_motivo text;
ALTER TABLE public.divergencias_recebimento_clientes ADD COLUMN anterior_id uuid REFERENCES public.divergencias_recebimento_clientes(id), ADD COLUMN alteracao_motivo text;
CREATE OR REPLACE FUNCTION public.editar_divergencia(p_origem text, p_id uuid, p_tipo text, p_c_prod text, p_quantidade numeric, p_observacao text, p_motivo text, p_x_prod text DEFAULT '', p_qtd_recebida numeric DEFAULT NULL, p_retorno_cd text DEFAULT '', p_fotos text[] DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_nf uuid; v_result jsonb; v_novo uuid; v_fotos text[];
BEGIN
 IF auth.uid() IS NULL OR NOT (SELECT public.is_active_operator()) THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE='42501'; END IF;
 IF nullif(btrim(p_motivo),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da alteração'; END IF;
 IF p_origem NOT IN ('cacau','clientes') OR p_origem IS NULL THEN RAISE EXCEPTION 'Origem inválida'; END IF;
 IF p_origem='cacau' THEN
   SELECT nf_id INTO v_nf FROM divergencias_recebimento WHERE id=p_id;
 ELSE
   SELECT nf_id INTO v_nf FROM divergencias_recebimento_clientes WHERE id=p_id;
 END IF;
 IF v_nf IS NOT NULL THEN PERFORM id FROM notas_fiscais WHERE id=v_nf FOR UPDATE; END IF;
 IF p_origem='cacau' THEN SELECT * INTO v FROM divergencias_recebimento WHERE id=p_id FOR UPDATE;
 ELSE SELECT * INTO v FROM divergencias_recebimento_clientes WHERE id=p_id FOR UPDATE; END IF;
 IF NOT FOUND OR v.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'Lançamento cancelado ou já alterado; atualize a lista'; END IF;
 IF v.nf_id IS DISTINCT FROM v_nf THEN RAISE EXCEPTION 'Vínculo da NF mudou; atualize a lista'; END IF;
 IF p_quantidade IS NULL OR p_quantidade < 0 OR (p_origem='cacau' AND p_quantidade <> trunc(p_quantidade)) THEN RAISE EXCEPTION 'Quantidade inválida'; END IF;
 IF p_qtd_recebida < 0 THEN RAISE EXCEPTION 'Quantidade recebida inválida'; END IF;
 IF EXISTS (SELECT 1 FROM unnest(coalesce(p_fotos,'{}')) f WHERE f NOT LIKE v.carga_id::text || '/%') THEN RAISE EXCEPTION 'Foto não pertence à carga'; END IF;
 SELECT coalesce(array_agg(DISTINCT f), '{}') INTO v_fotos FROM unnest(coalesce(v.fotos,'{}') || coalesce(p_fotos,'{}')) f;
 IF p_origem='cacau' THEN
   IF v.nf_id IS NULL AND p_tipo IS DISTINCT FROM 'sobra' THEN RAISE EXCEPTION 'Sem NF somente sobra'; END IF;
   IF p_tipo NOT IN ('falta_parcial','falta_total','avaria','sobra') OR p_tipo IS NULL THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
   UPDATE etiquetas SET status='pendente', divergencia_motivo=NULL, divergencia_por=NULL, divergencia_em=NULL
   WHERE id=ANY(v.etiquetas_bloqueadas) AND status='divergencia' AND divergencia_motivo IN ('Falta parcial no recebimento (origem)','Falta total no recebimento — NF cancelada');
   IF v.tipo='falta_total' THEN UPDATE notas_fiscais SET status_entrega=coalesce(v.status_nf_anterior,'CARGA NO DEPOSITO') WHERE id=v.nf_id AND status_entrega='NF CANCELADA'; END IF;
   UPDATE divergencias_recebimento SET cancelado_em=now(),cancelado_por=auth.uid(),cancelado_motivo='Substituído por edição: '||btrim(p_motivo) WHERE id=p_id;
   IF v.nf_id IS NULL THEN
     v_result:=public.registrar_sobra_recebimento(v.carga_id,v.embarcador,p_c_prod,p_x_prod,p_quantidade::integer,p_observacao,v_fotos);
   ELSE
     v_result:=public.registrar_divergencia_recebimento(v.nf_id,p_tipo,p_c_prod,p_quantidade::integer,p_observacao,v_fotos);
   END IF;
   IF coalesce((v_result->>'duplicada')::boolean,false) THEN RAISE EXCEPTION 'Já existe outra ocorrência com esses dados; nenhuma alteração foi salva'; END IF;
   v_novo:=(v_result->>'id')::uuid;
   UPDATE divergencias_recebimento SET anterior_id=p_id,alteracao_motivo=btrim(p_motivo) WHERE id=v_novo;
 ELSE
   IF (v.nf_id IS NULL AND p_tipo IS DISTINCT FROM 'SOBRA') OR p_tipo IS NULL OR NOT (p_tipo=ANY(CASE WHEN v.embarcador='DOCILE' THEN ARRAY['FALTA','SOBRA','AVARIA'] WHEN v.embarcador='HERSHEYS' THEN ARRAY['FALTA','AVARIA','SOBRA','CURTA VALIDADE','PREÇO DIVERGENTE'] ELSE ARRAY['FALTA','AVARIA','SOBRA','INVERSÃO','INV/AVARIA','FALTA/AVARIA','OUTROS'] END)) THEN RAISE EXCEPTION 'Tipo inválido para o embarcador'; END IF;
   IF nullif(p_retorno_cd,'') IS NOT NULL AND p_retorno_cd NOT IN ('PROCEDE DO CD','NÃO PROCEDE DO CD') THEN RAISE EXCEPTION 'Retorno inválido'; END IF;
   UPDATE divergencias_recebimento_clientes SET cancelado_em=now(),cancelado_por=auth.uid(),cancelado_motivo='Substituído por edição: '||btrim(p_motivo) WHERE id=p_id;
   v_result:=public.registrar_divergencia_cliente(v.carga_id,v.nf_id,v.embarcador,p_tipo,p_c_prod,p_x_prod,p_qtd_recebida,p_quantidade,p_retorno_cd,p_observacao,v_fotos);
   v_novo:=(v_result->>'id')::uuid;
   UPDATE divergencias_recebimento_clientes SET anterior_id=p_id,alteracao_motivo=btrim(p_motivo) WHERE id=v_novo;
 END IF;
 RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public.editar_divergencia(text,uuid,text,text,numeric,text,text,text,numeric,text,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.editar_divergencia(text,uuid,text,text,numeric,text,text,text,numeric,text,text[]) TO authenticated;