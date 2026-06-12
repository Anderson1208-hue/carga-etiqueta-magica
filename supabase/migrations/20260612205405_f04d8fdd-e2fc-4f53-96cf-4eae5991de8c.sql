
ALTER TABLE public.baixas_entrega
  ADD COLUMN IF NOT EXISTS validacao_score_v1 int,
  ADD COLUMN IF NOT EXISTS validacao_status_v1 text,
  ADD COLUMN IF NOT EXISTS validacao_problemas_v1 jsonb,
  ADD COLUMN IF NOT EXISTS validacao_em_v1 timestamptz;

UPDATE public.baixas_entrega
   SET validacao_score_v1 = validacao_score,
       validacao_status_v1 = validacao_status,
       validacao_problemas_v1 = validacao_problemas,
       validacao_em_v1 = validacao_em
 WHERE validacao_status IS NOT NULL
   AND validacao_score_v1 IS NULL;

CREATE INDEX IF NOT EXISTS idx_baixas_validacao_status_v1
  ON public.baixas_entrega (validacao_status_v1);
