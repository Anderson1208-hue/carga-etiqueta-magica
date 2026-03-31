
ALTER TABLE public.monitoramento_config
  ADD COLUMN IF NOT EXISTS intervalo_padrao_segundos integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS intervalo_critico_segundos integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS distance_filter_metros integer NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS geofence_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS batch_sync_ativo boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS batch_max_posicoes integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS raio_aproximacao_metros integer NOT NULL DEFAULT 500;
