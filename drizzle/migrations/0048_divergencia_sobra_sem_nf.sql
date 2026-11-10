ALTER TABLE public.divergencias_recebimento ALTER COLUMN nf_id DROP NOT NULL;
ALTER TABLE public.divergencias_recebimento ADD COLUMN IF NOT EXISTS embarcador text;
ALTER TABLE public.divergencias_recebimento ADD CONSTRAINT divergencias_recebimento_sobra_check
  CHECK ((tipo = 'sobra' AND embarcador IN ('IBAC','IBAE') AND carga_id IS NOT NULL) OR (tipo <> 'sobra' AND nf_id IS NOT NULL));

CREATE OR REPLACE FUNCTION public.registrar_sobra_recebimento(p_carga_id uuid, p_embarcador text, p_c_prod text, p_x_prod text,
  p_quantidade integer, p_observacao text, p_fotos text[])
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE v_uid uuid := auth.uid(); v_nome text; v_id uuid;
  v_cprod text := nullif(btrim(coalesce(p_c_prod,'')), ''); v_xprod text := nullif(btrim(coalesce(p_x_prod,'')), '');
BEGIN
  IF v_uid IS NULL OR NOT public.is_active_operator() THEN RAISE EXCEPTION 'Acesso negado' USING ERRCODE = '42501'; END IF;
  IF p_embarcador NOT IN ('IBAC','IBAE') THEN RAISE EXCEPTION 'Escolha IBAC ou IBAE'; END IF;
  IF NOT EXISTS (SELECT 1 FROM cargas WHERE id = p_carga_id) THEN RAISE EXCEPTION 'Carga não encontrada'; END IF;
  IF v_cprod IS NULL OR v_xprod IS NULL THEN RAISE EXCEPTION 'Informe o código e a descrição do produto'; END IF;
  IF coalesce(p_quantidade,0) <= 0 THEN RAISE EXCEPTION 'Informe a quantidade de caixas'; END IF;
  SELECT coalesce(full_name, email) INTO v_nome FROM profiles WHERE id = v_uid;
  INSERT INTO divergencias_recebimento (carga_id, nf_id, numero_nf, c_prod, x_prod, tipo, quantidade, observacao, fotos,
    etiquetas_bloqueadas, etiquetas_ja_bipadas, qtd_nao_bloqueada, criado_por, criado_por_nome, embarcador)
  VALUES (p_carga_id, NULL, '', v_cprod, v_xprod, 'sobra', p_quantidade, nullif(btrim(coalesce(p_observacao,'')),''),
    coalesce(p_fotos,'{}'), '{}', '[]'::jsonb, 0, v_uid, v_nome, p_embarcador) RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id);
END $function$;
REVOKE ALL ON FUNCTION public.registrar_sobra_recebimento(uuid,text,text,text,integer,text,text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_sobra_recebimento(uuid,text,text,text,integer,text,text[]) TO authenticated;