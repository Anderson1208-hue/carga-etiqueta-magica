CREATE TABLE public.cte_detalhes (
  chave_cte text PRIMARY KEY,
  numero_cte text,
  data_emissao date,
  cfop text,
  municipio_inicio text,
  uf_inicio text,
  municipio_fim text,
  uf_fim text,
  valor_total_prestacao numeric,
  valor_receber numeric,
  componentes jsonb NOT NULL DEFAULT '[]'::jsonb,
  quantidades jsonb NOT NULL DEFAULT '[]'::jsonb,
  icms jsonb,
  valor_carga numeric,
  xml text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.cte_detalhes TO authenticated;
GRANT ALL ON public.cte_detalhes TO service_role;
ALTER TABLE public.cte_detalhes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operadores leem detalhes CT-e" ON public.cte_detalhes FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));
CREATE POLICY "Operadores gravam detalhes CT-e" ON public.cte_detalhes FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_active_operator()));
CREATE INDEX idx_cte_detalhes_data ON public.cte_detalhes (data_emissao);