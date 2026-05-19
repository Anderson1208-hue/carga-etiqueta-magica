
ALTER TABLE public.baixas_entrega
  ADD COLUMN IF NOT EXISTS conferido_em timestamptz,
  ADD COLUMN IF NOT EXISTS conferido_por uuid,
  ADD COLUMN IF NOT EXISTS conferencia_status text,
  ADD COLUMN IF NOT EXISTS conferencia_motivo text;

ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS prestacao_contas_em timestamptz,
  ADD COLUMN IF NOT EXISTS prestacao_contas_por uuid,
  ADD COLUMN IF NOT EXISTS prestacao_contas_obs text;

CREATE INDEX IF NOT EXISTS idx_baixas_conferido_em ON public.baixas_entrega(conferido_em);
CREATE INDEX IF NOT EXISTS idx_veiculos_prestacao ON public.veiculos(data, prestacao_contas_em);
