-- Seed every active shipper into Anderson's isolated commercial registry.
-- Existing parallel clients, regions, tariffs and operational tables are untouched.
INSERT INTO public.paralelo_clientes (cnpj, nome, fiscal, observacao, ativo)
SELECT
  regexp_replace(e.cnpj, '\D', '', 'g') AS cnpj,
  coalesce(nullif(btrim(e.nome_fantasia), ''), btrim(e.razao_social)) AS nome,
  '{"cfop":"","cst":"","aliquota":"","uf_inicio":"","uf_fim":""}'::jsonb AS fiscal,
  '' AS observacao,
  true AS ativo
FROM public.embarcadores e
WHERE e.ativo
  AND regexp_replace(e.cnpj, '\D', '', 'g') ~ '^[0-9]{14}$'
  AND coalesce(nullif(btrim(e.nome_fantasia), ''), btrim(e.razao_social)) <> ''
ON CONFLICT (cnpj) DO NOTHING;