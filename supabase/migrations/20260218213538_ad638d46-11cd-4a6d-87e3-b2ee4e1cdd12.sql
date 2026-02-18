
-- Update get_conferencia_progress to include 3-state tracking
CREATE OR REPLACE FUNCTION public.get_conferencia_progress(p_carga_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $$
  SELECT jsonb_build_object(
    'total', COALESCE(SUM(counts.total), 0),
    'conferidas', COALESCE(SUM(counts.conferidas), 0),
    'conferidas_interno', COALESCE(SUM(counts.conferidas_interno), 0),
    'nfs', COALESCE(jsonb_agg(
      jsonb_build_object(
        'numero_nf', counts.numero_nf,
        'total', counts.total,
        'conferidas', counts.conferidas,
        'conferidas_interno', counts.conferidas_interno
      ) ORDER BY counts.numero_nf::integer
    ), '[]'::jsonb)
  )
  FROM (
    SELECT 
      e.numero_nf,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE e.status = 'conferido')::int AS conferidas,
      COUNT(*) FILTER (WHERE e.status = 'conferido_interno')::int AS conferidas_interno
    FROM etiquetas e
    WHERE e.carga_id = p_carga_id
    GROUP BY e.numero_nf
  ) counts
$$;
