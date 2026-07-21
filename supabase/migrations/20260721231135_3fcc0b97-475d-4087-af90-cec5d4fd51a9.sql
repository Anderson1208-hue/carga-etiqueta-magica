
-- ============================================
-- Fundação: rastreabilidade de origem de coordenadas
-- ============================================

-- Enum de origem (hierarquia de confiança)
DO $$ BEGIN
  CREATE TYPE public.origem_coordenada AS ENUM (
    'manual',              -- editado por operador (máxima confiança)
    'google_places_nome',  -- Places Text Search por nome do cliente (ROOFTOP)
    'google_geocode',      -- Geocoding por endereço (ROOFTOP/RANGE_INTERPOLATED)
    'brasilapi_cep',       -- BrasilAPI (centroide do CEP)
    'nominatim',           -- OSM Nominatim (baixa confiança)
    'baixa_motorista',     -- GPS do motorista ao dar baixa (NÃO CONFIÁVEL)
    'legado_desconhecido'  -- pré-rastreabilidade
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- destinatario_enderecos
ALTER TABLE public.destinatario_enderecos
  ADD COLUMN IF NOT EXISTS origem_coordenada public.origem_coordenada,
  ADD COLUMN IF NOT EXISTS confianca_coordenada SMALLINT CHECK (confianca_coordenada BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS coordenada_atualizada_em TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS coordenada_atualizada_por TEXT;

-- roteirizacao_paradas (para saber de onde veio a coord da parada roteirizada)
ALTER TABLE public.roteirizacao_paradas
  ADD COLUMN IF NOT EXISTS origem_coordenada public.origem_coordenada,
  ADD COLUMN IF NOT EXISTS confianca_coordenada SMALLINT CHECK (confianca_coordenada BETWEEN 0 AND 100);

-- monitoramento_paradas (mesmo)
ALTER TABLE public.monitoramento_paradas
  ADD COLUMN IF NOT EXISTS origem_coordenada public.origem_coordenada,
  ADD COLUMN IF NOT EXISTS confianca_coordenada SMALLINT CHECK (confianca_coordenada BETWEEN 0 AND 100);

-- Backfill: coordenadas existentes com nulos viram 'legado_desconhecido' + confiança 30
UPDATE public.destinatario_enderecos
SET origem_coordenada = 'legado_desconhecido', confianca_coordenada = 30
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND origem_coordenada IS NULL;

UPDATE public.roteirizacao_paradas
SET origem_coordenada = 'legado_desconhecido', confianca_coordenada = 30
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND origem_coordenada IS NULL;

UPDATE public.monitoramento_paradas
SET origem_coordenada = 'legado_desconhecido', confianca_coordenada = 30
WHERE latitude IS NOT NULL AND longitude IS NOT NULL AND origem_coordenada IS NULL;

-- Função guarda: pode sobrescrever coord existente?
-- Regra: só sobrescreve se a nova origem tiver confiança >= atual.
CREATE OR REPLACE FUNCTION public.pode_sobrescrever_coordenada(
  origem_nova public.origem_coordenada,
  origem_atual public.origem_coordenada
) RETURNS BOOLEAN
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE origem_nova
      WHEN 'manual' THEN 100
      WHEN 'google_places_nome' THEN 90
      WHEN 'google_geocode' THEN 80
      WHEN 'brasilapi_cep' THEN 40
      WHEN 'nominatim' THEN 35
      WHEN 'baixa_motorista' THEN 10
      WHEN 'legado_desconhecido' THEN 30
      ELSE 0
    END
    >=
    COALESCE(
      CASE origem_atual
        WHEN 'manual' THEN 100
        WHEN 'google_places_nome' THEN 90
        WHEN 'google_geocode' THEN 80
        WHEN 'brasilapi_cep' THEN 40
        WHEN 'nominatim' THEN 35
        WHEN 'baixa_motorista' THEN 10
        WHEN 'legado_desconhecido' THEN 30
        ELSE 0
      END,
      0
    );
$$;

COMMENT ON FUNCTION public.pode_sobrescrever_coordenada IS
  'Retorna TRUE se a nova origem tem confiança >= atual. Usar em todo job de enriquecimento antes de UPDATE.';

-- Índice para consultas por origem/confiança
CREATE INDEX IF NOT EXISTS idx_dest_end_origem
  ON public.destinatario_enderecos (origem_coordenada, confianca_coordenada);
