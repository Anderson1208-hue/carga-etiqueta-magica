ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS pernoite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pernoite_origem_id uuid;

CREATE INDEX IF NOT EXISTS idx_veiculos_pernoite ON public.veiculos(pernoite) WHERE pernoite = true;