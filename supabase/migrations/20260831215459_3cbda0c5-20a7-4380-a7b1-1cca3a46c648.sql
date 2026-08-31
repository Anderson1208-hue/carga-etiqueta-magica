CREATE OR REPLACE FUNCTION public.produtos_alerta_m3_confiavel(
  p_dias integer DEFAULT 30,
  p_cnpj text DEFAULT NULL
)
RETURNS TABLE(
  produto_id uuid,
  cnpj_embarcador text,
  razao_social_embarcador text,
  codigo text,
  descricao text,
  unidade text,
  volume_m3 numeric,
  volume_calculado boolean,
  origem_cadastro text,
  motivo text,
  ocorrencias bigint,
  qtd_total numeric,
  ultima_data date
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id AS produto_id,
    p.cnpj_embarcador,
    max(e.razao_social) AS razao_social_embarcador,
    p.codigo,
    p.descricao,
    p.unidade,
    p.volume_m3,
    p.volume_calculado,
    p.origem_cadastro,
    CASE
      WHEN p.volume_m3 IS NULL OR p.volume_m3 = 0 THEN 'sem_cubagem'
      WHEN p.volume_calculado THEN 'cubagem_calculada'
    END AS motivo,
    count(*)::bigint AS ocorrencias,
    sum(i.q_com) AS qtd_total,
    max(coalesce(nf.data_emissao, nf.created_at::date)) AS ultima_data
  FROM public.produtos p
  LEFT JOIN public.embarcadores e ON e.cnpj = p.cnpj_embarcador
  JOIN public.itens_nf i
    ON ltrim(btrim(p.codigo), '0') = ltrim(btrim(i.c_prod), '0')
  JOIN public.notas_fiscais nf
    ON nf.id = i.nf_id
    AND regexp_replace(nf.cnpj_emitente, '\D', '', 'g') = p.cnpj_embarcador
  WHERE p.ativo
    AND p.cnpj_embarcador IS NOT NULL
    AND coalesce(nf.data_emissao, nf.created_at::date) >= (current_date - p_dias)
    AND (p.volume_m3 IS NULL OR p.volume_m3 = 0 OR p.volume_calculado)
    AND (p_cnpj IS NULL OR p.cnpj_embarcador = regexp_replace(p_cnpj, '\D', '', 'g'))
  GROUP BY
    p.id,
    p.cnpj_embarcador,
    p.codigo,
    p.descricao,
    p.unidade,
    p.volume_m3,
    p.volume_calculado,
    p.origem_cadastro
  ORDER BY count(*) DESC, p.codigo;
$$;

REVOKE ALL ON FUNCTION public.produtos_alerta_m3_confiavel(integer, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.produtos_alerta_m3_confiavel(integer, text) TO authenticated, service_role;