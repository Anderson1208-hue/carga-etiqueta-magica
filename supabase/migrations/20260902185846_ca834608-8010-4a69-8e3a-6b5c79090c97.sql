ALTER TABLE public.relatorios_canhotos_diarios
  ADD COLUMN IF NOT EXISTS progresso_offset integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS itens jsonb,
  ADD COLUMN IF NOT EXISTS zip_partes jsonb NOT NULL DEFAULT '[]'::jsonb;