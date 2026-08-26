CREATE OR REPLACE FUNCTION public.conciliar_veiculo_ibac(p_veiculo_id uuid)
RETURNS TABLE(
  nf_id uuid,
  numero_nf text,
  dest_razao_social text,
  dest_cidade text,
  cnpj_destinatario text,
  em_escopo_ibac boolean,
  baixa_id uuid,
  ocorrencia text,
  status_baixa text,
  tem_foto boolean,
  conferencia_status text,
  queue_status text,
  queue_erro text,
  enviado_em timestamptz,
  classificacao text,
  gravidade text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  RETURN QUERY
  WITH prefixos AS (
    SELECT regexp_replace(c.cnpj, '\D', '', 'g') AS p
    FROM public.cnpj_envio_canhoto_auto c
    WHERE c.ativo = true AND coalesce(c.cnpj, '') <> ''
  ),
  nfs AS (
    SELECT n.id, n.numero_nf, n.dest_razao_social, n.dest_cidade,
           n.cnpj_destinatario, n.cnpj_emitente
    FROM public.veiculo_nfs vn
    JOIN public.notas_fiscais n ON n.id = vn.nf_id
    WHERE vn.veiculo_id = p_veiculo_id
  ),
  base AS (
    SELECT
      nfs.id,
      nfs.numero_nf,
      nfs.dest_razao_social,
      nfs.dest_cidade,
      nfs.cnpj_destinatario,
      EXISTS (
        SELECT 1 FROM prefixos pr
        WHERE regexp_replace(coalesce(nfs.cnpj_destinatario, ''), '\D', '', 'g') LIKE pr.p || '%'
           OR regexp_replace(coalesce(nfs.cnpj_emitente, ''), '\D', '', 'g') LIKE pr.p || '%'
      ) AS em_escopo,
      b.id AS baixa_id,
      b.ocorrencia,
      b.status AS status_baixa,
      (b.foto_path IS NOT NULL OR b.foto_recibo_path IS NOT NULL) AS tem_foto,
      b.conferencia_status,
      q.status::text AS queue_status,
      q.erro_mensagem AS queue_erro,
      q.enviado_em
    FROM nfs
    LEFT JOIN LATERAL (
      SELECT * FROM public.baixas_entrega be
      WHERE be.nf_id = nfs.id
      ORDER BY be.registrado_em DESC NULLS LAST
      LIMIT 1
    ) b ON true
    LEFT JOIN LATERAL (
      SELECT * FROM public.ibac_eventos_queue eq
      WHERE eq.evento_interno = 'envio_canhoto'
        AND (eq.baixa_id = b.id OR (b.id IS NULL AND eq.nf_id = nfs.id))
      ORDER BY (eq.status = 'enviado') DESC, eq.created_at DESC
      LIMIT 1
    ) q ON true
  )
  SELECT
    base.id,
    base.numero_nf,
    base.dest_razao_social,
    base.dest_cidade,
    base.cnpj_destinatario,
    base.em_escopo,
    base.baixa_id,
    base.ocorrencia,
    base.status_baixa,
    coalesce(base.tem_foto, false),
    base.conferencia_status,
    base.queue_status,
    base.queue_erro,
    base.enviado_em,
    cls.classificacao,
    cls.gravidade
  FROM base
  CROSS JOIN LATERAL (
    SELECT
      CASE
        WHEN base.baixa_id IS NULL THEN 'sem_desfecho'
        WHEN base.ocorrencia IN ('reentrega','recusado','ausente','endereco_nao_encontrado','outros')
          THEN 'ocorrencia_valida'
        WHEN NOT base.em_escopo THEN 'fora_escopo_ibac'
        WHEN NOT coalesce(base.tem_foto, false) THEN 'entregue_sem_foto'
        WHEN base.queue_status = 'enviado' THEN 'canhoto_enviado'
        WHEN base.queue_status = 'erro' THEN 'canhoto_erro_envio'
        WHEN base.queue_status IN ('pendente') THEN 'canhoto_na_fila'
        WHEN base.queue_status = 'cancelado' THEN 'canhoto_cancelado'
        ELSE 'canhoto_nao_enfileirado'
      END AS classificacao,
      CASE
        WHEN base.baixa_id IS NULL THEN 'erro'
        WHEN base.ocorrencia IN ('reentrega','recusado','ausente','endereco_nao_encontrado','outros') THEN 'ok'
        WHEN NOT base.em_escopo THEN 'ok'
        WHEN NOT coalesce(base.tem_foto, false) THEN 'erro'
        WHEN base.queue_status = 'enviado' THEN 'ok'
        WHEN base.queue_status = 'erro' THEN 'erro'
        WHEN base.queue_status = 'pendente' THEN 'atencao'
        WHEN base.queue_status = 'cancelado' THEN 'erro'
        ELSE 'erro'
      END AS gravidade
  ) cls
  ORDER BY
    CASE cls.gravidade WHEN 'erro' THEN 0 WHEN 'atencao' THEN 1 ELSE 2 END,
    base.numero_nf;
END;
$$;

GRANT EXECUTE ON FUNCTION public.conciliar_veiculo_ibac(uuid) TO authenticated;