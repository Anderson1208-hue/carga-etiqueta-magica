
ALTER TABLE public.baixas_entrega
  ADD COLUMN IF NOT EXISTS validacao_score int,
  ADD COLUMN IF NOT EXISTS validacao_status text,
  ADD COLUMN IF NOT EXISTS validacao_problemas jsonb,
  ADD COLUMN IF NOT EXISTS validacao_em timestamptz;

CREATE INDEX IF NOT EXISTS idx_baixas_entrega_validacao_status
  ON public.baixas_entrega(validacao_status);
