
DO $$ BEGIN
  CREATE TYPE public.tipo_endereco AS ENUM ('fiscal','entrega','doca','coleta');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.destinatario_enderecos
  ADD COLUMN IF NOT EXISTS tipo_endereco public.tipo_endereco NOT NULL DEFAULT 'fiscal',
  ADD COLUMN IF NOT EXISTS ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS observacao text;

CREATE INDEX IF NOT EXISTS idx_dest_end_tipo
  ON public.destinatario_enderecos(destinatario_id, tipo_endereco, ativo);

CREATE UNIQUE INDEX IF NOT EXISTS uq_dest_end_entrega_principal
  ON public.destinatario_enderecos(destinatario_id)
  WHERE tipo_endereco = 'entrega' AND principal = true AND ativo = true;

-- Haversine helper
CREATE OR REPLACE FUNCTION public.haversine_metros(lat1 numeric, lon1 numeric, lat2 numeric, lon2 numeric)
RETURNS numeric
LANGUAGE sql IMMUTABLE AS $$
  SELECT (6371000 * 2 * asin(sqrt(
    power(sin(radians(($3 - $1)::float)/2), 2) +
    cos(radians($1::float)) * cos(radians($3::float)) *
    power(sin(radians(($4 - $2)::float)/2), 2)
  )))::numeric;
$$;
GRANT EXECUTE ON FUNCTION public.haversine_metros(numeric,numeric,numeric,numeric) TO authenticated, service_role;

-- Resolver endereço operacional
CREATE OR REPLACE FUNCTION public.resolver_endereco_operacional(_destinatario_id uuid)
RETURNS TABLE(
  endereco_id uuid,
  latitude numeric,
  longitude numeric,
  tipo public.tipo_endereco,
  origem public.origem_coordenada,
  confianca smallint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, latitude, longitude, tipo_endereco, origem_coordenada, confianca_coordenada
  FROM public.destinatario_enderecos
  WHERE destinatario_id = _destinatario_id
    AND ativo = true
    AND latitude IS NOT NULL AND longitude IS NOT NULL
  ORDER BY
    CASE tipo_endereco
      WHEN 'doca' THEN 1 WHEN 'entrega' THEN 2 WHEN 'coleta' THEN 3 WHEN 'fiscal' THEN 4
    END,
    principal DESC NULLS LAST,
    COALESCE(confianca_coordenada,0) DESC
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION public.resolver_endereco_operacional(uuid) TO authenticated, service_role;

-- P8: baixa aderência da rota (pings totais no dia)
CREATE OR REPLACE FUNCTION public.rota_baixa_aderencia(_monitoramento_rota_id uuid, _min_pings int DEFAULT 200)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(COUNT(*),0) < _min_pings
  FROM public.posicoes_gps
  WHERE monitoramento_rota_id = _monitoramento_rota_id;
$$;
GRANT EXECUTE ON FUNCTION public.rota_baixa_aderencia(uuid,int) TO authenticated, service_role;

-- Diagnóstico v3
CREATE OR REPLACE VIEW public.vw_diagnostico_paradas_v3 AS
WITH pings AS (
  SELECT
    mp.id AS parada_id,
    mp.monitoramento_rota_id,
    mp.latitude, mp.longitude,
    mp.raio_geofence_metros,
    COUNT(pg.*) AS total_pings,
    COUNT(pg.*) FILTER (
      WHERE public.haversine_metros(pg.latitude, pg.longitude, mp.latitude, mp.longitude)
            <= COALESCE(mp.raio_geofence_metros, 500)
    ) AS pings_dentro
  FROM public.monitoramento_paradas mp
  LEFT JOIN public.posicoes_gps pg
    ON pg.monitoramento_rota_id = mp.monitoramento_rota_id
  WHERE mp.latitude IS NOT NULL AND mp.longitude IS NOT NULL
  GROUP BY mp.id
)
SELECT
  p.parada_id,
  p.monitoramento_rota_id,
  p.total_pings,
  p.pings_dentro,
  CASE
    WHEN public.rota_baixa_aderencia(p.monitoramento_rota_id) THEN 'aderencia_baixa'
    WHEN p.pings_dentro >= 5 THEN 'dentro'
    WHEN p.total_pings >= 20 AND p.pings_dentro = 0 THEN 'fora'
    WHEN p.total_pings < 20 THEN 'amostra_insuficiente'
    ELSE 'indeterminado'
  END AS classificacao_v3
FROM pings p;

GRANT SELECT ON public.vw_diagnostico_paradas_v3 TO authenticated, service_role;
