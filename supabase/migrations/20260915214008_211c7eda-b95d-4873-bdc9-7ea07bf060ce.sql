ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS conferencia_externa_fechada_em timestamptz,
  ADD COLUMN IF NOT EXISTS conferencia_externa_fechada_por uuid,
  ADD COLUMN IF NOT EXISTS conferencia_externa_com_pendencia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS conferencia_externa_pendencia_motivo text;

CREATE OR REPLACE FUNCTION public.conferencia_externa_status_veiculo(p_veiculo_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_veiculo record;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id, placa, conferencia_externa_fechada_em, conferencia_externa_fechada_por,
         conferencia_externa_com_pendencia, conferencia_externa_pendencia_motivo
    INTO v_veiculo
  FROM public.veiculos WHERE id = p_veiculo_id;

  IF v_veiculo.id IS NULL THEN
    RAISE EXCEPTION 'Veículo não encontrado';
  END IF;

  WITH nfs AS (
    SELECT vn.nf_id,
           vn.carga_origem_id AS carga_id,
           nf.numero_nf,
           EXISTS (
             SELECT 1 FROM public.cnpj_envio_canhoto_auto c
             WHERE c.ativo AND left(regexp_replace(nf.cnpj_emitente, '\D', '', 'g'), 8) = c.cnpj
           ) AS em_escopo
    FROM public.veiculo_nfs vn
    JOIN public.notas_fiscais nf ON nf.id = vn.nf_id
    WHERE vn.veiculo_id = p_veiculo_id
  ),
  prog AS (
    SELECT n.nf_id, n.numero_nf, n.em_escopo,
           COUNT(e.id) FILTER (WHERE e.status::text <> 'divergencia') AS total,
           COUNT(e.id) FILTER (WHERE e.status::text = 'conferido') AS conferidas
    FROM nfs n
    LEFT JOIN public.etiquetas e
      ON e.carga_id = n.carga_id AND e.numero_nf = n.numero_nf
    GROUP BY n.nf_id, n.numero_nf, n.em_escopo
  )
  SELECT jsonb_build_object(
    'placa', v_veiculo.placa,
    'fechada_em', v_veiculo.conferencia_externa_fechada_em,
    'com_pendencia', v_veiculo.conferencia_externa_com_pendencia,
    'pendencia_motivo', v_veiculo.conferencia_externa_pendencia_motivo,
    'total_nfs', (SELECT COUNT(*) FROM prog),
    'total_escopo', (SELECT COUNT(*) FROM prog WHERE em_escopo),
    'fora_escopo', (SELECT COUNT(*) FROM prog WHERE NOT em_escopo),
    'conferidas_escopo', (SELECT COUNT(*) FROM prog WHERE em_escopo AND total > 0 AND conferidas >= total),
    'faltando_escopo', (SELECT COUNT(*) FROM prog WHERE em_escopo AND (total = 0 OR conferidas < total)),
    'nfs_escopo', COALESCE((SELECT jsonb_agg(numero_nf ORDER BY numero_nf) FROM prog WHERE em_escopo), '[]'::jsonb),
    'nfs_faltando', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('numero_nf', numero_nf, 'total', total, 'conferidas', conferidas)
             ORDER BY numero_nf)
      FROM prog WHERE em_escopo AND (total = 0 OR conferidas < total)
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.fechar_conferencia_veiculo(
  p_veiculo_id uuid,
  p_forcar boolean DEFAULT false,
  p_motivo text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status jsonb;
  v_faltando int;
BEGIN
  IF NOT (public.is_admin(auth.uid()) OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_status := public.conferencia_externa_status_veiculo(p_veiculo_id);
  v_faltando := (v_status->>'faltando_escopo')::int;

  IF v_faltando > 0 THEN
    IF NOT p_forcar THEN
      RAISE EXCEPTION 'Faltam % nota(s) do escopo IBAC para fechar a conferência', v_faltando;
    END IF;
    IF NOT public.is_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Somente administrador pode fechar com pendência';
    END IF;
    IF p_motivo IS NULL OR length(btrim(p_motivo)) < 5 THEN
      RAISE EXCEPTION 'Informe o motivo da pendência';
    END IF;
  END IF;

  UPDATE public.veiculos
  SET conferencia_externa_fechada_em = now(),
      conferencia_externa_fechada_por = auth.uid(),
      conferencia_externa_com_pendencia = (v_faltando > 0),
      conferencia_externa_pendencia_motivo = CASE WHEN v_faltando > 0 THEN btrim(p_motivo) ELSE NULL END,
      updated_at = now()
  WHERE id = p_veiculo_id;

  RETURN public.conferencia_externa_status_veiculo(p_veiculo_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.conferencia_externa_status_veiculo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fechar_conferencia_veiculo(uuid, boolean, text) TO authenticated;