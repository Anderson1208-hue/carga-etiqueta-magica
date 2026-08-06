-- 1) Regiões por fornecedor
CREATE TABLE public.embarcador_regioes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embarcador_id uuid NOT NULL REFERENCES public.embarcadores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (embarcador_id, nome)
);

CREATE TABLE public.embarcador_regiao_cidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regiao_id uuid NOT NULL REFERENCES public.embarcador_regioes(id) ON DELETE CASCADE,
  uf text NOT NULL,
  municipio text NOT NULL,
  municipio_norm text GENERATED ALWAYS AS (upper(municipio)) STORED,
  codigo_municipio_ibge text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regiao_id, uf, municipio_norm)
);

CREATE TABLE public.embarcador_regiao_sla (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regiao_id uuid NOT NULL REFERENCES public.embarcador_regioes(id) ON DELETE CASCADE,
  prazo_dias_uteis integer NOT NULL,
  vigente_de date NOT NULL DEFAULT current_date,
  vigente_ate date,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.embarcador_regiao_tarifas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regiao_id uuid NOT NULL REFERENCES public.embarcador_regioes(id) ON DELETE CASCADE,
  tarifa_por_ton numeric,
  tarifa_fixa numeric,
  frete_minimo numeric,
  gris_percentual numeric,
  advalorem_percentual numeric,
  pedagio_por_100kg numeric,
  adicional_cte numeric,
  vigente_de date NOT NULL DEFAULT current_date,
  vigente_ate date,
  observacao text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Permissão restrita
CREATE OR REPLACE FUNCTION public.pode_gestao_comercial()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.ativo
      AND (p.role = 'admin'
           OR lower(p.email) IN ('julio.nogueira@tlmlogistica.com.br',
                                 'rodrigo.boamorte@tlmlogistica.com.br'))
  )
$$;
REVOKE EXECUTE ON FUNCTION public.pode_gestao_comercial() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_gestao_comercial() TO authenticated;

-- 3) Grants + RLS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.embarcador_regioes TO authenticated;
GRANT ALL ON public.embarcador_regioes TO service_role;
ALTER TABLE public.embarcador_regioes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comercial gerencia regioes" ON public.embarcador_regioes
  FOR ALL TO authenticated
  USING (public.pode_gestao_comercial()) WITH CHECK (public.pode_gestao_comercial());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.embarcador_regiao_cidades TO authenticated;
GRANT ALL ON public.embarcador_regiao_cidades TO service_role;
ALTER TABLE public.embarcador_regiao_cidades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comercial gerencia cidades" ON public.embarcador_regiao_cidades
  FOR ALL TO authenticated
  USING (public.pode_gestao_comercial()) WITH CHECK (public.pode_gestao_comercial());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.embarcador_regiao_sla TO authenticated;
GRANT ALL ON public.embarcador_regiao_sla TO service_role;
ALTER TABLE public.embarcador_regiao_sla ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comercial gerencia sla" ON public.embarcador_regiao_sla
  FOR ALL TO authenticated
  USING (public.pode_gestao_comercial()) WITH CHECK (public.pode_gestao_comercial());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.embarcador_regiao_tarifas TO authenticated;
GRANT ALL ON public.embarcador_regiao_tarifas TO service_role;
ALTER TABLE public.embarcador_regiao_tarifas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "comercial gerencia tarifas" ON public.embarcador_regiao_tarifas
  FOR ALL TO authenticated
  USING (public.pode_gestao_comercial()) WITH CHECK (public.pode_gestao_comercial());

-- 4) Índices
CREATE INDEX idx_emb_regioes_embarcador ON public.embarcador_regioes (embarcador_id);
CREATE INDEX idx_emb_regiao_cidades_regiao ON public.embarcador_regiao_cidades (regiao_id);
CREATE INDEX idx_emb_regiao_cidades_uf_mun ON public.embarcador_regiao_cidades (uf, municipio_norm);
CREATE INDEX idx_emb_regiao_sla_regiao ON public.embarcador_regiao_sla (regiao_id, vigente_de DESC);
CREATE INDEX idx_emb_regiao_tarifas_regiao ON public.embarcador_regiao_tarifas (regiao_id, vigente_de DESC);

-- 5) Triggers de updated_at
CREATE TRIGGER trg_emb_regioes_updated BEFORE UPDATE ON public.embarcador_regioes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_emb_regiao_sla_updated BEFORE UPDATE ON public.embarcador_regiao_sla
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_emb_regiao_tarifas_updated BEFORE UPDATE ON public.embarcador_regiao_tarifas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Consulta consolidada
CREATE OR REPLACE FUNCTION public.resolver_sla_tarifa(
  p_embarcador_id uuid,
  p_uf text,
  p_municipio text,
  p_data date DEFAULT current_date
)
RETURNS TABLE (
  regiao_id uuid,
  regiao_nome text,
  prazo_dias_uteis integer,
  tarifa_por_ton numeric,
  tarifa_fixa numeric,
  frete_minimo numeric,
  gris_percentual numeric,
  advalorem_percentual numeric,
  pedagio_por_100kg numeric,
  adicional_cte numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.id, r.nome,
    s.prazo_dias_uteis,
    t.tarifa_por_ton, t.tarifa_fixa, t.frete_minimo,
    t.gris_percentual, t.advalorem_percentual, t.pedagio_por_100kg, t.adicional_cte
  FROM public.embarcador_regioes r
  JOIN public.embarcador_regiao_cidades c ON c.regiao_id = r.id
  LEFT JOIN LATERAL (
    SELECT * FROM public.embarcador_regiao_sla s2
    WHERE s2.regiao_id = r.id AND s2.ativo
      AND s2.vigente_de <= p_data
      AND (s2.vigente_ate IS NULL OR s2.vigente_ate >= p_data)
    ORDER BY s2.vigente_de DESC LIMIT 1
  ) s ON true
  LEFT JOIN LATERAL (
    SELECT * FROM public.embarcador_regiao_tarifas t2
    WHERE t2.regiao_id = r.id AND t2.ativo
      AND t2.vigente_de <= p_data
      AND (t2.vigente_ate IS NULL OR t2.vigente_ate >= p_data)
    ORDER BY t2.vigente_de DESC LIMIT 1
  ) t ON true
  WHERE r.embarcador_id = p_embarcador_id
    AND r.ativo
    AND upper(c.uf) = upper(p_uf)
    AND c.municipio_norm = upper(p_municipio)
  LIMIT 1
$$;
REVOKE EXECUTE ON FUNCTION public.resolver_sla_tarifa(uuid, text, text, date) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolver_sla_tarifa(uuid, text, text, date) TO authenticated;