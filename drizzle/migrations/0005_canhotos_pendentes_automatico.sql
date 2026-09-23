DROP FUNCTION IF EXISTS public.listar_canhotos_pendentes();

CREATE FUNCTION public.listar_canhotos_pendentes()
RETURNS TABLE(
  baixa_id uuid, nf_id uuid, numero_nf text, dest_razao_social text, dest_cidade text,
  embarcador text, cnpj_emitente text,
  veiculo_id uuid, placa text, motorista text, data_rota date, registrado_em timestamptz,
  ocorrencia text, origem text, motivo text, observacao text, marcado_em timestamptz,
  marcado_por_nome text, dias_corridos integer, prazo_vencido boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  RETURN QUERY
  SELECT b.id, b.nf_id, n.numero_nf, n.dest_razao_social, n.dest_cidade,
    n.razao_social_emitente, n.cnpj_emitente,
    b.veiculo_id, v.placa, v.motorista, v.data, b.registrado_em, b.ocorrencia,
    CASE WHEN b.conferencia_status = 'canhoto_pendente' THEN 'manual' ELSE 'automatico' END,
    coalesce(b.canhoto_pendente_motivo, 'sem_canhoto_baixa'),
    coalesce(b.canhoto_pendente_obs, b.observacao),
    coalesce(b.canhoto_pendente_em, b.registrado_em),
    coalesce(p.nome, pr.nome),
    greatest(0, ((now() AT TIME ZONE 'America/Sao_Paulo')::date - (coalesce(b.canhoto_pendente_em, b.registrado_em) AT TIME ZONE 'America/Sao_Paulo')::date))::integer,
    public.canhoto_prazo_vencido(coalesce(b.canhoto_pendente_em, b.registrado_em))
  FROM public.baixas_entrega b
  JOIN public.notas_fiscais n ON n.id = b.nf_id
  LEFT JOIN public.veiculos v ON v.id = b.veiculo_id
  LEFT JOIN public.profiles p ON p.id = b.canhoto_pendente_por
  LEFT JOIN public.profiles pr ON pr.id = b.registrado_por
  WHERE b.canhoto_recuperado_em IS NULL
    AND (b.conferencia_status = 'canhoto_pendente'
         OR (b.ocorrencia = 'sem_canhoto' AND b.foto_path IS NULL AND b.foto_recibo_path IS NULL))
  ORDER BY coalesce(b.canhoto_pendente_em, b.registrado_em) NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.contar_canhotos_pendentes()
RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT CASE WHEN public.is_admin() OR public.is_active_operator() THEN (
    SELECT count(*)::integer FROM public.baixas_entrega b
    WHERE b.canhoto_recuperado_em IS NULL
      AND (b.conferencia_status = 'canhoto_pendente'
           OR (b.ocorrencia = 'sem_canhoto' AND b.foto_path IS NULL AND b.foto_recibo_path IS NULL))
  ) ELSE 0 END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_canhoto_recuperado(
  p_baixa_id uuid, p_foto_path text, p_foto_recibo_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_nf uuid;
  v_ator record;
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF coalesce(btrim(p_foto_path), '') = '' THEN
    RAISE EXCEPTION 'Foto do canhoto obrigatória';
  END IF;

  UPDATE public.baixas_entrega
     SET foto_path = p_foto_path,
         foto_recibo_path = coalesce(nullif(btrim(p_foto_recibo_path), ''), foto_recibo_path),
         ocorrencia = CASE WHEN ocorrencia = 'sem_canhoto' THEN 'entregue' ELSE ocorrencia END,
         status = CASE WHEN ocorrencia = 'sem_canhoto' THEN 'entregue' ELSE status END,
         conferencia_status = 'ok',
         conferido_em = now(),
         conferido_por = auth.uid(),
         canhoto_pendente_em = coalesce(canhoto_pendente_em, registrado_em),
         canhoto_recuperado_em = now(),
         canhoto_recuperado_por = auth.uid(),
         imagem_ibac_tentativas = 0,
         imagem_ibac_ultimo_erro = NULL,
         updated_at = now()
   WHERE id = p_baixa_id
  RETURNING nf_id INTO v_nf;

  IF v_nf IS NULL THEN
    RAISE EXCEPTION 'Baixa não encontrada';
  END IF;

  SELECT * INTO v_ator FROM public.fn_nfev_actor();
  PERFORM public.fn_nfev_insert(
    v_nf, 'canhoto_recuperado', now(), v_ator.ator_id, v_ator.ator_nome,
    jsonb_build_object('baixa_id', p_baixa_id, 'foto_path', p_foto_path),
    'manual', 'canhoto_recuperado:' || p_baixa_id::text || ':' || extract(epoch FROM now())::bigint::text
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.listar_canhotos_pendentes() TO authenticated;
GRANT EXECUTE ON FUNCTION public.contar_canhotos_pendentes() TO authenticated;