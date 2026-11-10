ALTER TABLE public.paralelo_tarifas ADD COLUMN status text NOT NULL DEFAULT 'sugerida';
ALTER TABLE public.paralelo_tarifas ADD CONSTRAINT paralelo_tarifas_status CHECK (status IN ('sugerida','aprovada'));
COMMENT ON COLUMN public.paralelo_tarifas.status IS 'Draft suggestions require explicit review; no operational effect.';