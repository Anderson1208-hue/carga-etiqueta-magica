
-- Adiciona novos valores ao enum
ALTER TYPE origem_coordenada ADD VALUE IF NOT EXISTS 'google_geocode_rooftop';
ALTER TYPE origem_coordenada ADD VALUE IF NOT EXISTS 'google_geocode_range';
ALTER TYPE origem_coordenada ADD VALUE IF NOT EXISTS 'dwell_factual_aprovado';
ALTER TYPE origem_coordenada ADD VALUE IF NOT EXISTS 'amostra_insuficiente';
