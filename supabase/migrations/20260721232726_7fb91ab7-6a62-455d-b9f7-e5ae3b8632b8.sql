
CREATE OR REPLACE FUNCTION public.confianca_origem(origem origem_coordenada)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE origem
    WHEN 'manual' THEN 100
    WHEN 'dwell_factual_aprovado' THEN 95
    WHEN 'google_geocode_rooftop' THEN 90
    WHEN 'google_geocode' THEN 80
    WHEN 'google_geocode_range' THEN 70
    WHEN 'google_places_nome' THEN 65
    WHEN 'brasilapi_cep' THEN 40
    WHEN 'nominatim' THEN 35
    WHEN 'legado_desconhecido' THEN 30
    WHEN 'baixa_motorista' THEN 10
    WHEN 'amostra_insuficiente' THEN 0
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.pode_sobrescrever_coordenada(
  origem_nova origem_coordenada,
  origem_atual origem_coordenada
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT public.confianca_origem(origem_nova) >= COALESCE(public.confianca_origem(origem_atual), 0);
$$;
