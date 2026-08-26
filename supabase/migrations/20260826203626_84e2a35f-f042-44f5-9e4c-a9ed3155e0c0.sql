ALTER TABLE public.baixas_entrega
  ADD COLUMN IF NOT EXISTS canhoto_pendente_motivo text,
  ADD COLUMN IF NOT EXISTS canhoto_pendente_obs text,
  ADD COLUMN IF NOT EXISTS canhoto_pendente_em timestamptz,
  ADD COLUMN IF NOT EXISTS canhoto_pendente_por uuid,
  ADD COLUMN IF NOT EXISTS canhoto_recuperado_em timestamptz,
  ADD COLUMN IF NOT EXISTS canhoto_recuperado_por uuid;

COMMENT ON COLUMN public.baixas_entrega.canhoto_pendente_motivo IS 'Motivo pelo qual o canhoto fisico nao voltou com o motorista (esquecido_motorista, perdido, retido_no_cliente, ilegivel_refazer, outro).';

CREATE INDEX IF NOT EXISTS idx_baixas_canhoto_pendente
  ON public.baixas_entrega (canhoto_pendente_em)
  WHERE conferencia_status = 'canhoto_pendente';

-- Prazo de recuperacao: 2 dias uteis (seg-sex) a partir da marcacao.
CREATE OR REPLACE FUNCTION public.canhoto_prazo_vencido(p_marcado_em timestamptz, p_dias_uteis integer DEFAULT 2)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN p_marcado_em IS NULL THEN false
    ELSE (
      SELECT count(*) >= p_dias_uteis
      FROM generate_series(
        (p_marcado_em AT TIME ZONE 'America/Sao_Paulo')::date + 1,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date,
        interval '1 day'
      ) d
      WHERE extract(isodow FROM d) < 6
    )
  END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_canhoto_pendente(
  p_baixa_id uuid,
  p_motivo text,
  p_obs text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nf uuid;
  v_ator record;
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF coalesce(btrim(p_motivo), '') = '' THEN
    RAISE EXCEPTION 'Motivo obrigatório';
  END IF;

  UPDATE public.baixas_entrega
     SET conferencia_status = 'canhoto_pendente',
         conferencia_motivo = btrim(p_motivo) || coalesce(' — ' || nullif(btrim(p_obs), ''), ''),
         conferido_em = now(),
         conferido_por = auth.uid(),
         canhoto_pendente_motivo = btrim(p_motivo),
         canhoto_pendente_obs = nullif(btrim(p_obs), ''),
         canhoto_pendente_em = now(),
         canhoto_pendente_por = auth.uid(),
         canhoto_recuperado_em = NULL,
         canhoto_recuperado_por = NULL,
         updated_at = now()
   WHERE id = p_baixa_id
  RETURNING nf_id INTO v_nf;

  IF v_nf IS NULL THEN
    RAISE EXCEPTION 'Baixa não encontrada';
  END IF;

  SELECT * INTO v_ator FROM public.fn_nfev_actor();
  PERFORM public.fn_nfev_insert(
    v_nf, 'canhoto_pendente', now(), v_ator.ator_id, v_ator.ator_nome,
    jsonb_build_object('baixa_id', p_baixa_id, 'motivo', btrim(p_motivo), 'observacao', nullif(btrim(p_obs), '')),
    'manual', 'canhoto_pendente:' || p_baixa_id::text || ':' || extract(epoch FROM now())::bigint::text
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_canhoto_recuperado(
  p_baixa_id uuid,
  p_foto_path text,
  p_foto_recibo_path text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
         conferencia_status = 'ok',
         conferido_em = now(),
         conferido_por = auth.uid(),
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

CREATE OR REPLACE FUNCTION public.listar_canhotos_pendentes()
RETURNS TABLE(
  baixa_id uuid,
  nf_id uuid,
  numero_nf text,
  dest_razao_social text,
  dest_cidade text,
  veiculo_id uuid,
  placa text,
  motorista text,
  data_rota date,
  registrado_em timestamptz,
  ocorrencia text,
  motivo text,
  observacao text,
  marcado_em timestamptz,
  marcado_por_nome text,
  dias_corridos integer,
  prazo_vencido boolean
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
  SELECT
    b.id,
    b.nf_id,
    n.numero_nf,
    n.dest_razao_social,
    n.dest_cidade,
    b.veiculo_id,
    v.placa,
    v.motorista,
    v.data,
    b.registrado_em,
    b.ocorrencia,
    b.canhoto_pendente_motivo,
    b.canhoto_pendente_obs,
    b.canhoto_pendente_em,
    p.nome,
    greatest(0, (((now() AT TIME ZONE 'America/Sao_Paulo')::date) - ((b.canhoto_pendente_em AT TIME ZONE 'America/Sao_Paulo')::date)))::integer,
    public.canhoto_prazo_vencido(b.canhoto_pendente_em)
  FROM public.baixas_entrega b
  JOIN public.notas_fiscais n ON n.id = b.nf_id
  LEFT JOIN public.veiculos v ON v.id = b.veiculo_id
  LEFT JOIN public.profiles p ON p.id = b.canhoto_pendente_por
  WHERE b.conferencia_status = 'canhoto_pendente'
  ORDER BY b.canhoto_pendente_em NULLS LAST;
END;
$$;

-- Conciliação: canhoto pendente de recuperação é atenção dentro do prazo e erro depois.
CREATE OR REPLACE FUNCTION public.conciliar_veiculo_ibac(p_veiculo_id uuid)
RETURNS TABLE(nf_id uuid, numero_nf text, dest_razao_social text, dest_cidade text, cnpj_destinatario text, em_escopo_ibac boolean, baixa_id uuid, ocorrencia text, status_baixa text, tem_foto boolean, conferencia_status text, queue_status text, queue_erro text, enviado_em timestamp with time zone, classificacao text, gravidade text)
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
      b.canhoto_pendente_em,
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
        WHEN base.conferencia_status = 'canhoto_pendente' THEN 'canhoto_pendente_recuperacao'
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
        WHEN base.conferencia_status = 'canhoto_pendente'
          THEN CASE WHEN public.canhoto_prazo_vencido(base.canhoto_pendente_em) THEN 'erro' ELSE 'atencao' END
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