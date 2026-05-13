
ALTER TABLE public.posicoes_gps
  ADD COLUMN IF NOT EXISTS heartbeat boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS client_ts timestamptz;

CREATE INDEX IF NOT EXISTS idx_posicoes_gps_rota_client_ts
  ON public.posicoes_gps (monitoramento_rota_id, client_ts);

CREATE UNIQUE INDEX IF NOT EXISTS uq_posicoes_gps_rota_client_ts
  ON public.posicoes_gps (monitoramento_rota_id, client_ts)
  WHERE client_ts IS NOT NULL;
