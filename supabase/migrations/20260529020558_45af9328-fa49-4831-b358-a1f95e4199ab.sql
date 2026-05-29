ALTER TABLE public.ctes DROP CONSTRAINT IF EXISTS ctes_chave_cte_key;
CREATE UNIQUE INDEX IF NOT EXISTS ctes_chave_cte_nf_id_key ON public.ctes (chave_cte, COALESCE(nf_id::text, ''));