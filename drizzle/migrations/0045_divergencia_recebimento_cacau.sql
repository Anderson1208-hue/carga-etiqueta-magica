CREATE TABLE public.divergencias_recebimento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id uuid,
  nf_id uuid NOT NULL REFERENCES public.notas_fiscais(id),
  numero_nf text NOT NULL,
  c_prod text,
  x_prod text,
  tipo text NOT NULL CHECK (tipo IN ('falta_parcial','avaria','falta_total')),
  quantidade integer NOT NULL DEFAULT 0 CHECK (quantidade >= 0),
  observacao text,
  fotos text[] NOT NULL DEFAULT '{}',
  etiquetas_bloqueadas uuid[] NOT NULL DEFAULT '{}',
  etiquetas_ja_bipadas jsonb NOT NULL DEFAULT '[]'::jsonb,
  qtd_nao_bloqueada integer NOT NULL DEFAULT 0,
  status_nf_anterior text,
  criado_por uuid NOT NULL,
  criado_por_nome text,
  criado_em timestamptz NOT NULL DEFAULT now(),
  cancelado_em timestamptz,
  cancelado_por uuid,
  cancelado_motivo text
);
CREATE INDEX divergencias_recebimento_carga_idx ON public.divergencias_recebimento (carga_id, criado_em);
CREATE INDEX divergencias_recebimento_nf_idx ON public.divergencias_recebimento (nf_id);
CREATE UNIQUE INDEX divergencias_recebimento_total_unico ON public.divergencias_recebimento (nf_id) WHERE tipo = 'falta_total' AND cancelado_em IS NULL;
CREATE UNIQUE INDEX divergencias_recebimento_item_unico ON public.divergencias_recebimento (nf_id, c_prod, tipo) WHERE tipo <> 'falta_total' AND cancelado_em IS NULL;

GRANT SELECT ON public.divergencias_recebimento TO authenticated;
GRANT ALL ON public.divergencias_recebimento TO service_role;
REVOKE ALL ON public.divergencias_recebimento FROM anon;
ALTER TABLE public.divergencias_recebimento ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operadores ativos leem divergências" ON public.divergencias_recebimento
  FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));

CREATE TABLE public.divergencias_recebimento_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id uuid NOT NULL,
  ocorrencias integer NOT NULL,
  enviado_por uuid,
  enviado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX divergencias_envios_carga_idx ON public.divergencias_recebimento_envios (carga_id, enviado_em DESC);
GRANT SELECT ON public.divergencias_recebimento_envios TO authenticated;
GRANT ALL ON public.divergencias_recebimento_envios TO service_role;
REVOKE ALL ON public.divergencias_recebimento_envios FROM anon;
ALTER TABLE public.divergencias_recebimento_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operadores ativos leem envios de divergência" ON public.divergencias_recebimento_envios
  FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));

CREATE OR REPLACE FUNCTION public.registrar_divergencia_recebimento(
  p_nf_id uuid, p_tipo text, p_c_prod text, p_quantidade integer, p_observacao text, p_fotos text[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_nf record;
  v_nome text;
  v_existente record;
  v_total_caixas integer;
  v_ja_parcial integer;
  v_x_prod text;
  v_ids uuid[] := '{}';
  v_bipadas jsonb := '[]'::jsonb;
  v_motivo text;
  v_id uuid;
  v_falta integer := 0;
  v_cprod text := nullif(btrim(coalesce(p_c_prod,'')), '');
BEGIN
  IF v_uid IS NULL OR NOT public.is_active_operator() THEN
    RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501';
  END IF;
  IF p_tipo NOT IN ('falta_parcial','avaria','falta_total') THEN
    RAISE EXCEPTION 'Tipo de divergência inválido';
  END IF;

  SELECT id, carga_id, numero_nf, cnpj_emitente, status_entrega INTO v_nf
    FROM notas_fiscais WHERE id = p_nf_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NF não encontrada'; END IF;
  IF left(regexp_replace(coalesce(v_nf.cnpj_emitente,''), '\D', '', 'g'), 8) NOT IN ('61472205','42431457') THEN
    RAISE EXCEPTION 'Somente notas IBAC e IBAE podem ter divergência de recebimento';
  END IF;
  SELECT coalesce(full_name, email) INTO v_nome FROM profiles WHERE id = v_uid;

  IF p_tipo = 'falta_total' THEN
    SELECT * INTO v_existente FROM divergencias_recebimento
      WHERE nf_id = p_nf_id AND tipo = 'falta_total' AND cancelado_em IS NULL;
    IF FOUND THEN
      RETURN jsonb_build_object('id', v_existente.id, 'duplicada', true,
        'bloqueadas', coalesce(array_length(v_existente.etiquetas_bloqueadas,1),0), 'ja_bipadas', v_existente.etiquetas_ja_bipadas);
    END IF;
    IF v_nf.status_entrega IS DISTINCT FROM 'CARGA NO DEPOSITO' THEN
      RAISE EXCEPTION 'A NF está com status % e não pode ser cancelada no recebimento', coalesce(v_nf.status_entrega,'vazio');
    END IF;
    IF EXISTS (SELECT 1 FROM veiculo_nfs WHERE nf_id = p_nf_id) THEN
      RAISE EXCEPTION 'A NF já está em um veículo da roteirização; retire-a antes de lançar falta total';
    END IF;
    v_motivo := 'Falta total no recebimento — NF cancelada';
    SELECT coalesce(array_agg(id), '{}') INTO v_ids FROM (
      SELECT id FROM etiquetas WHERE nf_id = p_nf_id AND status = 'pendente' FOR UPDATE) s;
    SELECT coalesce(jsonb_agg(jsonb_build_object('c_prod', c_prod, 'seq', seq, 'total', total, 'status', status) ORDER BY c_prod, seq), '[]'::jsonb)
      INTO v_bipadas FROM etiquetas WHERE nf_id = p_nf_id AND status IN ('conferido_interno','conferido');
    UPDATE etiquetas SET status = 'divergencia', divergencia_motivo = v_motivo, divergencia_por = v_uid, divergencia_em = now()
      WHERE id = ANY(v_ids);
    INSERT INTO divergencias_recebimento (carga_id, nf_id, numero_nf, tipo, quantidade, observacao, fotos,
      etiquetas_bloqueadas, etiquetas_ja_bipadas, status_nf_anterior, criado_por, criado_por_nome)
    VALUES (v_nf.carga_id, p_nf_id, v_nf.numero_nf, 'falta_total', 0, nullif(btrim(coalesce(p_observacao,'')),''), coalesce(p_fotos,'{}'),
      v_ids, v_bipadas, v_nf.status_entrega, v_uid, v_nome) RETURNING id INTO v_id;
    UPDATE notas_fiscais SET status_entrega = 'NF CANCELADA' WHERE id = p_nf_id;
    RETURN jsonb_build_object('id', v_id, 'duplicada', false, 'bloqueadas', coalesce(array_length(v_ids,1),0), 'ja_bipadas', v_bipadas);
  END IF;

  IF v_cprod IS NULL THEN RAISE EXCEPTION 'Informe o código do produto'; END IF;
  IF coalesce(p_quantidade,0) <= 0 THEN RAISE EXCEPTION 'Informe a quantidade de caixas'; END IF;
  IF EXISTS (SELECT 1 FROM divergencias_recebimento WHERE nf_id = p_nf_id AND tipo = 'falta_total' AND cancelado_em IS NULL) THEN
    RAISE EXCEPTION 'Esta NF já foi cancelada por falta total';
  END IF;
  SELECT ceil(coalesce(sum(q_com),0))::int, max(x_prod) INTO v_total_caixas, v_x_prod
    FROM itens_nf WHERE nf_id = p_nf_id AND ltrim(c_prod,'0') = ltrim(v_cprod,'0');
  IF v_x_prod IS NULL THEN RAISE EXCEPTION 'Código % não existe nesta NF', v_cprod; END IF;
  SELECT c_prod INTO v_cprod FROM itens_nf WHERE nf_id = p_nf_id AND ltrim(c_prod,'0') = ltrim(v_cprod,'0') LIMIT 1;
  IF p_quantidade > v_total_caixas THEN
    RAISE EXCEPTION 'Quantidade maior que as % caixas do código na NF', v_total_caixas;
  END IF;

  SELECT * INTO v_existente FROM divergencias_recebimento
    WHERE nf_id = p_nf_id AND c_prod = v_cprod AND tipo = p_tipo AND cancelado_em IS NULL;
  IF FOUND THEN
    IF v_existente.quantidade = p_quantidade THEN
      RETURN jsonb_build_object('id', v_existente.id, 'duplicada', true,
        'bloqueadas', coalesce(array_length(v_existente.etiquetas_bloqueadas,1),0), 'ja_bipadas', v_existente.etiquetas_ja_bipadas,
        'nao_bloqueadas', v_existente.qtd_nao_bloqueada);
    END IF;
    RAISE EXCEPTION 'Já existe lançamento de % caixas para este código; peça a um administrador para cancelar e lance de novo', v_existente.quantidade;
  END IF;

  IF p_tipo = 'falta_parcial' THEN
    v_motivo := 'Falta parcial no recebimento (origem)';
    SELECT coalesce(array_agg(id), '{}') INTO v_ids FROM (
      SELECT id FROM etiquetas WHERE nf_id = p_nf_id AND c_prod = v_cprod AND status = 'pendente'
      ORDER BY seq DESC LIMIT p_quantidade FOR UPDATE) s;
    v_falta := p_quantidade - coalesce(array_length(v_ids,1),0);
    IF v_falta > 0 THEN
      SELECT coalesce(jsonb_agg(jsonb_build_object('c_prod', c_prod, 'seq', seq, 'total', total, 'status', status) ORDER BY seq), '[]'::jsonb)
        INTO v_bipadas FROM etiquetas WHERE nf_id = p_nf_id AND c_prod = v_cprod AND status IN ('conferido_interno','conferido');
    END IF;
    UPDATE etiquetas SET status = 'divergencia', divergencia_motivo = v_motivo, divergencia_por = v_uid, divergencia_em = now()
      WHERE id = ANY(v_ids);
  END IF;

  INSERT INTO divergencias_recebimento (carga_id, nf_id, numero_nf, c_prod, x_prod, tipo, quantidade, observacao, fotos,
    etiquetas_bloqueadas, etiquetas_ja_bipadas, qtd_nao_bloqueada, criado_por, criado_por_nome)
  VALUES (v_nf.carga_id, p_nf_id, v_nf.numero_nf, v_cprod, v_x_prod, p_tipo, p_quantidade, nullif(btrim(coalesce(p_observacao,'')),''),
    coalesce(p_fotos,'{}'), v_ids, v_bipadas, greatest(v_falta,0), v_uid, v_nome) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'duplicada', false, 'bloqueadas', coalesce(array_length(v_ids,1),0),
    'ja_bipadas', v_bipadas, 'nao_bloqueadas', greatest(v_falta,0));
END $$;
REVOKE ALL ON FUNCTION public.registrar_divergencia_recebimento(uuid, text, text, integer, text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_divergencia_recebimento(uuid, text, text, integer, text, text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.cancelar_divergencia_recebimento(p_id uuid, p_motivo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v record; v_uid uuid := auth.uid(); v_rest integer;
BEGIN
  IF v_uid IS NULL OR NOT public.is_admin() THEN RAISE EXCEPTION 'Somente administradores podem cancelar' USING ERRCODE='42501'; END IF;
  IF nullif(btrim(coalesce(p_motivo,'')),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo do cancelamento'; END IF;
  SELECT * INTO v FROM divergencias_recebimento WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR v.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'Lançamento não encontrado ou já cancelado'; END IF;
  UPDATE etiquetas SET status = 'pendente', divergencia_motivo = NULL, divergencia_por = NULL, divergencia_em = NULL
    WHERE id = ANY(v.etiquetas_bloqueadas) AND status = 'divergencia'
      AND divergencia_motivo IN ('Falta parcial no recebimento (origem)','Falta total no recebimento — NF cancelada');
  GET DIAGNOSTICS v_rest = ROW_COUNT;
  IF v.tipo = 'falta_total' THEN
    UPDATE notas_fiscais SET status_entrega = coalesce(v.status_nf_anterior,'CARGA NO DEPOSITO')
      WHERE id = v.nf_id AND status_entrega = 'NF CANCELADA';
  END IF;
  UPDATE divergencias_recebimento SET cancelado_em = now(), cancelado_por = v_uid, cancelado_motivo = btrim(p_motivo) WHERE id = p_id;
  RETURN jsonb_build_object('etiquetas_liberadas', v_rest);
END $$;
REVOKE ALL ON FUNCTION public.cancelar_divergencia_recebimento(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_divergencia_recebimento(uuid, text) TO authenticated;

CREATE POLICY "Operadores ativos enviam fotos de divergência" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'divergencias-recebimento' AND (SELECT public.is_active_operator()));
CREATE POLICY "Operadores ativos leem fotos de divergência" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'divergencias-recebimento' AND (SELECT public.is_active_operator()));