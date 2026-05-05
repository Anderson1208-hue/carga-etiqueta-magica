CREATE OR REPLACE FUNCTION public.get_cargas_com_contagens()
RETURNS TABLE (
  id uuid,
  data date,
  placa text,
  motorista text,
  observacao text,
  status load_status,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz,
  import_batch_id text,
  operador_responsavel uuid,
  tipo_carga text,
  nfs_count bigint,
  itens_count bigint
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    c.id, c.data, c.placa, c.motorista, c.observacao, c.status,
    c.created_by, c.created_at, c.updated_at, c.import_batch_id,
    c.operador_responsavel, c.tipo_carga,
    COALESCE(nf_agg.nfs_count, 0) AS nfs_count,
    COALESCE(nf_agg.itens_count, 0) AS itens_count
  FROM public.cargas c
  LEFT JOIN (
    SELECT
      nf.carga_id,
      COUNT(DISTINCT nf.id) AS nfs_count,
      COUNT(i.id) AS itens_count
    FROM public.notas_fiscais nf
    LEFT JOIN public.itens_nf i ON i.nf_id = nf.id
    GROUP BY nf.carga_id
  ) nf_agg ON nf_agg.carga_id = c.id
  WHERE public.is_admin() OR public.is_active_operator()
  ORDER BY c.created_at DESC;
$$;