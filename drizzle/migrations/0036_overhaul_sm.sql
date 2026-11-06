CREATE TABLE public.overhaul_sm (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL,
  placa text NOT NULL,
  data_rota date NOT NULL,
  status text NOT NULL DEFAULT 'gerando' CHECK (status IN ('gerando','gerada','falha')),
  sm_numero text,
  rota_portal_id text,
  erro text,
  detalhes jsonb,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.overhaul_sm TO authenticated;
GRANT ALL ON public.overhaul_sm TO service_role;
ALTER TABLE public.overhaul_sm ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operadores leem SM" ON public.overhaul_sm FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));
CREATE UNIQUE INDEX overhaul_sm_uma_gerando ON public.overhaul_sm (veiculo_id) WHERE status = 'gerando';
CREATE INDEX overhaul_sm_veiculo ON public.overhaul_sm (veiculo_id, created_at DESC);