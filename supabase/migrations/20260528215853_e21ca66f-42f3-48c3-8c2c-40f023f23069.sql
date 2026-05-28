ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS pernoite boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pernoite_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_nf_pernoite ON public.notas_fiscais(pernoite) WHERE pernoite = true;