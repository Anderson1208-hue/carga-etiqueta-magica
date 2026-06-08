ALTER TABLE public.posicoes_gps
ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'legacy-js';

COMMENT ON COLUMN public.posicoes_gps.source IS 'Origem do ponto GPS: legacy-js, web-js, community-js-queue, transistor-native-http, manual-diagnostic, etc.';