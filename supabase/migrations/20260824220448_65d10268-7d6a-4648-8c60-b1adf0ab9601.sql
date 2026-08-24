ALTER TABLE public.ibac_config_envio
  ADD COLUMN IF NOT EXISTS placas_piloto text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS data_piloto date,
  ADD COLUMN IF NOT EXISTS canhoto_apos_prestacao boolean NOT NULL DEFAULT true;