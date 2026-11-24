CREATE TABLE public.pandurata_otm_envios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 ordem_coleta_id uuid NOT NULL REFERENCES public.ordens_coleta(id),
 shipment_id text NOT NULL,
 iniciado_por uuid NOT NULL,
 iniciado_em timestamptz NOT NULL DEFAULT now(),
 concluido_em timestamptz,
 status text NOT NULL DEFAULT 'em_andamento' CHECK (status IN ('em_andamento','confirmado','erro','incerto')),
 dados jsonb NOT NULL,
 status_portal text,
 mensagem text,
 creditos_firecrawl numeric,
 creditos_lovable numeric
);
GRANT SELECT ON public.pandurata_otm_envios TO authenticated;
GRANT ALL ON public.pandurata_otm_envios TO service_role;
ALTER TABLE public.pandurata_otm_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY leitura_operadores ON public.pandurata_otm_envios FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()) OR (SELECT public.is_admin()));
CREATE INDEX pandurata_otm_envios_ordem ON public.pandurata_otm_envios(ordem_coleta_id, iniciado_em DESC);
CREATE UNIQUE INDEX pandurata_otm_envios_reserva ON public.pandurata_otm_envios(shipment_id) WHERE status IN ('em_andamento','incerto');