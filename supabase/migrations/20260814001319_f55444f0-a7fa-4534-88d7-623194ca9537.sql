CREATE OR REPLACE FUNCTION public.relatorio_periodo(
  p_inicio date,
  p_fim date,
  p_dimensao text DEFAULT 'placa',
  p_embarcador text DEFAULT NULL,
  p_uf text DEFAULT NULL,
  p_cidade text DEFAULT NULL,
  p_destinatario text DEFAULT NULL,
  p_placa text DEFAULT NULL
)
RETURNS TABLE(
  dimensao text,
  cargas bigint,
  nfs bigint,
  destinatarios bigint,
  caixas numeric,
  peso_kg numeric,
  volume_m3 numeric,
  densidade numeric,
  entregues bigint,
  pendentes bigint,
  recusados bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT
      nf.id,
      nf.cnpj_destinatario,
      COALESCE(nf.peso_bruto, 0) AS peso_bruto,
      COALESCE(nf.volume_m3, 0) AS volume_m3,
      nf.status_entrega,
      c.id AS carga_id,
      CASE p_dimensao
        WHEN 'placa' THEN COALESCE(vv.placa, c.placa, 'SEM PLACA')
        WHEN 'destinatario' THEN COALESCE(NULLIF(nf.dest_razao_social, ''), nf.cnpj_destinatario, 'SEM DESTINATARIO')
        WHEN 'embarcador' THEN COALESCE(NULLIF(nf.razao_social_emitente, ''), nf.cnpj_emitente, 'SEM EMBARCADOR')
        WHEN 'cidade' THEN COALESCE(NULLIF(nf.dest_cidade, ''), '-') || '/' || COALESCE(NULLIF(nf.dest_uf, ''), '-')
        WHEN 'uf' THEN COALESCE(NULLIF(nf.dest_uf, ''), '-')
        WHEN 'bairro' THEN COALESCE(NULLIF(nf.dest_bairro, ''), '-')
        WHEN 'data' THEN to_char(c.data, 'YYYY-MM-DD')
        WHEN 'carga' THEN to_char(c.data, 'DD/MM/YYYY') || ' - ' || COALESCE(c.placa, '-')
        ELSE 'TOTAL DO PERIODO'
      END AS dimensao
    FROM notas_fiscais nf
    JOIN cargas c ON c.id = nf.carga_id
    LEFT JOIN LATERAL (
      SELECT v.placa
      FROM veiculo_nfs vn
      JOIN veiculos v ON v.id = vn.veiculo_id
      WHERE vn.nf_id = nf.id
      ORDER BY vn.created_at DESC
      LIMIT 1
    ) vv ON true
    WHERE c.data BETWEEN p_inicio AND p_fim
      AND (p_embarcador IS NULL OR nf.razao_social_emitente ILIKE '%' || p_embarcador || '%')
      AND (p_uf IS NULL OR nf.dest_uf = upper(p_uf))
      AND (p_cidade IS NULL OR nf.dest_cidade ILIKE '%' || p_cidade || '%')
      AND (p_destinatario IS NULL OR nf.dest_razao_social ILIKE '%' || p_destinatario || '%' OR regexp_replace(COALESCE(nf.cnpj_destinatario, ''), '\D', '', 'g') LIKE '%' || regexp_replace(p_destinatario, '\D', '', 'g') || '%')
      AND (p_placa IS NULL OR COALESCE(vv.placa, c.placa) ILIKE '%' || replace(p_placa, ' ', '') || '%')
  ),
  cx AS (
    SELECT i.nf_id, SUM(ceil(COALESCE(i.q_com, 0))) AS caixas
    FROM itens_nf i
    WHERE i.nf_id IN (SELECT id FROM base)
    GROUP BY i.nf_id
  )
  SELECT
    b.dimensao,
    COUNT(DISTINCT b.carga_id) AS cargas,
    COUNT(*) AS nfs,
    COUNT(DISTINCT b.cnpj_destinatario) AS destinatarios,
    COALESCE(SUM(cx.caixas), 0) AS caixas,
    ROUND(SUM(b.peso_bruto)::numeric, 2) AS peso_kg,
    ROUND(SUM(b.volume_m3)::numeric, 3) AS volume_m3,
    ROUND((SUM(b.peso_bruto) / NULLIF(SUM(b.volume_m3), 0))::numeric, 1) AS densidade,
    COUNT(*) FILTER (WHERE b.status_entrega = 'ENTREGUE') AS entregues,
    COUNT(*) FILTER (WHERE b.status_entrega IS NULL OR b.status_entrega NOT IN ('ENTREGUE', 'RECUSADO')) AS pendentes,
    COUNT(*) FILTER (WHERE b.status_entrega = 'RECUSADO') AS recusados
  FROM base b
  LEFT JOIN cx ON cx.nf_id = b.id
  GROUP BY b.dimensao
  ORDER BY 3 DESC, 1
$$;

REVOKE ALL ON FUNCTION public.relatorio_periodo(date, date, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.relatorio_periodo(date, date, text, text, text, text, text, text) TO authenticated;