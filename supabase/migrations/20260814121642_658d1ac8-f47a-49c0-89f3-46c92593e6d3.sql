CREATE OR REPLACE FUNCTION public.aplicar_cubagem_produtos_nf(p_dias integer DEFAULT 30, p_simular boolean DEFAULT true)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_atualizadas integer := 0;
  v_completas integer := 0;
  v_incompletas integer := 0;
BEGIN
  IF NOT public.is_active_operator() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  CREATE TEMP TABLE tmp_cub ON COMMIT DROP AS
  SELECT
    nf.id AS nf_id,
    count(*) AS itens,
    count(p.id) AS itens_com_cadastro,
    sum(i.q_com * coalesce(p.volume_m3, 0)) AS volume_m3,
    sum(i.q_com * coalesce(p.peso_bruto_cx_kg, 0)) AS peso_bruto
  FROM public.notas_fiscais nf
  JOIN public.itens_nf i ON i.nf_id = nf.id
  LEFT JOIN public.produtos p
    ON p.cnpj_embarcador = regexp_replace(nf.cnpj_emitente, '\D', '', 'g')
   AND ltrim(btrim(p.codigo), '0') = ltrim(btrim(i.c_prod), '0')
   AND p.ativo
  WHERE coalesce(nf.data_emissao, nf.created_at::date) >= (current_date - p_dias)
    AND coalesce(nf.volume_m3, 0) = 0
  GROUP BY nf.id;

  SELECT
    count(*) FILTER (WHERE itens_com_cadastro = itens AND volume_m3 > 0),
    count(*) FILTER (WHERE itens_com_cadastro < itens OR volume_m3 = 0)
  INTO v_completas, v_incompletas
  FROM tmp_cub;

  IF NOT p_simular THEN
    UPDATE public.notas_fiscais nf
    SET volume_m3 = round(t.volume_m3::numeric, 4),
        peso_bruto = CASE WHEN coalesce(nf.peso_bruto, 0) = 0 AND t.peso_bruto > 0
                          THEN round(t.peso_bruto::numeric, 3) ELSE nf.peso_bruto END
    FROM tmp_cub t
    WHERE t.nf_id = nf.id
      AND t.itens_com_cadastro = t.itens
      AND t.volume_m3 > 0;
    v_atualizadas := (SELECT count(*) FROM tmp_cub WHERE itens_com_cadastro = itens AND volume_m3 > 0);
  END IF;

  RETURN jsonb_build_object(
    'simulacao', p_simular,
    'nfs_sem_cubagem', (SELECT count(*) FROM tmp_cub),
    'elegiveis', v_completas,
    'pendentes_cadastro', v_incompletas,
    'atualizadas', v_atualizadas
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.produtos_pendentes_cadastro(p_dias integer DEFAULT 30, p_cnpj text DEFAULT NULL)
RETURNS TABLE(cnpj_emitente text, razao_social_emitente text, c_prod text, x_prod text, u_com text, ocorrencias bigint, qtd_total numeric, ultima_data date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  SELECT
    regexp_replace(nf.cnpj_emitente, '\D', '', 'g') AS cnpj_emitente,
    max(nf.razao_social_emitente) AS razao_social_emitente,
    i.c_prod,
    max(i.x_prod) AS x_prod,
    max(i.u_com) AS u_com,
    count(*)::bigint AS ocorrencias,
    sum(i.q_com) AS qtd_total,
    max(coalesce(nf.data_emissao, nf.created_at::date)) AS ultima_data
  FROM public.itens_nf i
  JOIN public.notas_fiscais nf ON nf.id = i.nf_id
  WHERE coalesce(nf.data_emissao, nf.created_at::date) >= (current_date - p_dias)
    AND (p_cnpj IS NULL OR regexp_replace(nf.cnpj_emitente, '\D', '', 'g') = regexp_replace(p_cnpj, '\D', '', 'g'))
    AND NOT EXISTS (
      SELECT 1 FROM public.produtos p
      WHERE p.cnpj_embarcador = regexp_replace(nf.cnpj_emitente, '\D', '', 'g')
        AND ltrim(btrim(p.codigo), '0') = ltrim(btrim(i.c_prod), '0')
    )
  GROUP BY 1, i.c_prod
  ORDER BY count(*) DESC, i.c_prod;
$function$;

REVOKE ALL ON FUNCTION public.aplicar_cubagem_produtos_nf(integer, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.produtos_pendentes_cadastro(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aplicar_cubagem_produtos_nf(integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.produtos_pendentes_cadastro(integer, text) TO authenticated, service_role;