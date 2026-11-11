ALTER TABLE public.divergencias_recebimento_clientes DROP CONSTRAINT divergencias_recebimento_clientes_embarcador_check;
ALTER TABLE public.divergencias_recebimento_clientes ADD CONSTRAINT divergencias_recebimento_clientes_embarcador_check
  CHECK (embarcador = ANY (ARRAY['ARCOR/BAGLEY','MASTERFOODS','PANDURATA','DOCILE','HERSHEYS']));
ALTER TABLE public.divergencias_recebimento_clientes DROP CONSTRAINT divergencias_recebimento_clientes_status_check;
ALTER TABLE public.divergencias_recebimento_clientes ADD CONSTRAINT divergencias_recebimento_clientes_status_check
  CHECK (status = ANY (ARRAY['FALTA','AVARIA','SOBRA','INVERSÃO','INV/AVARIA','FALTA/AVARIA','OUTROS','CURTA VALIDADE','PREÇO DIVERGENTE']));

CREATE OR REPLACE FUNCTION public.embarcador_divergencia_cliente(p_cnpj text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT CASE left(regexp_replace(coalesce(p_cnpj,''), '\D', '', 'g'), 8)
    WHEN '54360656' THEN 'ARCOR/BAGLEY' WHEN '06042467' THEN 'ARCOR/BAGLEY'
    WHEN '29737368' THEN 'MASTERFOODS' WHEN '70940994' THEN 'PANDURATA'
    WHEN '94261534' THEN 'DOCILE' WHEN '04429377' THEN 'HERSHEYS' END
$function$;

CREATE OR REPLACE FUNCTION public.registrar_divergencia_cliente(p_carga_id uuid, p_nf_id uuid, p_embarcador text, p_status text, p_c_prod text, p_x_prod text, p_qtd_recebida numeric, p_quantidade numeric, p_retorno_cd text, p_observacao text, p_fotos text[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_nome text; v_id uuid; v_nf record; v_emb text; v_xprod text; v_qnf numeric;
  v_cprod text := nullif(btrim(coalesce(p_c_prod,'')), ''); v_qtd numeric; v_carga uuid := p_carga_id; v_num text := '';
BEGIN
  IF v_uid IS NULL OR NOT public.is_active_operator() THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  IF v_cprod IS NULL THEN RAISE EXCEPTION 'Informe o código do produto'; END IF;
  IF p_nf_id IS NOT NULL THEN
    SELECT id, carga_id, numero_nf, cnpj_emitente INTO v_nf FROM notas_fiscais WHERE id = p_nf_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'NF não encontrada'; END IF;
    v_emb := public.embarcador_divergencia_cliente(v_nf.cnpj_emitente);
    IF v_emb IS NULL THEN RAISE EXCEPTION 'Somente Arcor/Bagley, Masterfoods, Pandurata, Docile e Hersheys nesta tela'; END IF;
    v_carga := coalesce(v_nf.carga_id, p_carga_id); v_num := v_nf.numero_nf;
    SELECT max(x_prod), sum(q_com) INTO v_xprod, v_qnf FROM itens_nf WHERE nf_id = p_nf_id AND ltrim(c_prod,'0') = ltrim(v_cprod,'0');
    IF v_xprod IS NULL AND p_status <> 'SOBRA' THEN RAISE EXCEPTION 'Código % não existe nesta NF', v_cprod; END IF;
  ELSE
    IF p_status <> 'SOBRA' THEN RAISE EXCEPTION 'Só a sobra pode ser lançada sem NF'; END IF;
    v_emb := p_embarcador;
  END IF;
  IF v_emb NOT IN ('ARCOR/BAGLEY','MASTERFOODS','PANDURATA','DOCILE','HERSHEYS') THEN RAISE EXCEPTION 'Embarcador inválido'; END IF;
  IF v_carga IS NULL OR NOT EXISTS (SELECT 1 FROM cargas WHERE id = v_carga) THEN RAISE EXCEPTION 'Escolha a carga'; END IF;
  v_xprod := coalesce(v_xprod, nullif(btrim(coalesce(p_x_prod,'')), ''));
  IF v_xprod IS NULL THEN RAISE EXCEPTION 'Informe a descrição do produto'; END IF;
  v_qtd := CASE WHEN p_qtd_recebida IS NOT NULL AND v_qnf IS NOT NULL THEN abs(v_qnf - p_qtd_recebida) ELSE p_quantidade END;
  IF coalesce(v_qtd,0) <= 0 THEN RAISE EXCEPTION 'Informe a quantidade da divergência'; END IF;
  SELECT coalesce(full_name, email) INTO v_nome FROM profiles WHERE id = v_uid;
  INSERT INTO divergencias_recebimento_clientes (carga_id, nf_id, numero_nf, embarcador, c_prod, x_prod, status, retorno_cd,
    qtd_nf, qtd_recebida, quantidade, observacao, fotos, criado_por, criado_por_nome)
  VALUES (v_carga, p_nf_id, v_num, v_emb, v_cprod, v_xprod, p_status, nullif(p_retorno_cd,''), v_qnf, p_qtd_recebida, v_qtd,
    nullif(btrim(coalesce(p_observacao,'')),''), coalesce(p_fotos,'{}'), v_uid, v_nome) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'quantidade', v_qtd);
END $function$;