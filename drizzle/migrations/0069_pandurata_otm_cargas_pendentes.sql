CREATE TABLE public.pandurata_otm_cargas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id text NOT NULL UNIQUE,
  remessa_id text,
  numero_dt text,
  status_tender text,
  status_agendamento text,
  inicio_viagem timestamptz,
  fim_viagem timestamptz,
  tipo_equipamento text,
  tipo_carga text,
  qtd_pallets integer,
  qtd_caixas integer,
  cliente text,
  cidade_destino text,
  uf_destino text,
  valor_mercadoria numeric,
  num_paradas integer,
  numero_ordens integer,
  peso_liquido_kg numeric,
  peso_bruto_kg numeric,
  volume_liquido_m3 numeric,
  volume_bruto_m3 numeric,
  custo_frete numeric,
  remessas text[] NOT NULL DEFAULT '{}',
  paradas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ordem_coleta_id uuid REFERENCES public.ordens_coleta(id) ON DELETE SET NULL,
  capturado_em timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pandurata_otm_cargas_dt_idx ON public.pandurata_otm_cargas (numero_dt);
CREATE INDEX pandurata_otm_cargas_inicio_idx ON public.pandurata_otm_cargas (inicio_viagem DESC);
GRANT SELECT ON public.pandurata_otm_cargas TO authenticated;
GRANT UPDATE (ordem_coleta_id) ON public.pandurata_otm_cargas TO authenticated;
GRANT ALL ON public.pandurata_otm_cargas TO service_role;
ALTER TABLE public.pandurata_otm_cargas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operadores veem cargas OTM" ON public.pandurata_otm_cargas FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));
CREATE POLICY "Operadores vinculam ordem de coleta" ON public.pandurata_otm_cargas FOR UPDATE TO authenticated USING ((SELECT public.is_active_operator())) WITH CHECK ((SELECT public.is_active_operator()));

CREATE TABLE public.pandurata_otm_execucoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_por uuid,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  sucesso boolean,
  total_sem_veiculo integer,
  novas integer,
  gravadas integer,
  restantes integer,
  creditos_firecrawl numeric,
  erro text
);
CREATE INDEX pandurata_otm_execucoes_inicio_idx ON public.pandurata_otm_execucoes (iniciado_em DESC);
GRANT SELECT ON public.pandurata_otm_execucoes TO authenticated;
GRANT ALL ON public.pandurata_otm_execucoes TO service_role;
ALTER TABLE public.pandurata_otm_execucoes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operadores veem execucoes OTM" ON public.pandurata_otm_execucoes FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));