
-- ============================================================
-- FASE A: Cadastros fiscais expandidos + tabelas paramétricas
-- ============================================================

-- 1. Expandir configuracao_fiscal_emitente
ALTER TABLE public.configuracao_fiscal_emitente
  ADD COLUMN IF NOT EXISTS seguradora_razao text,
  ADD COLUMN IF NOT EXISTS seguradora_cnpj text,
  ADD COLUMN IF NOT EXISTS seguradora_apolice text,
  ADD COLUMN IF NOT EXISTS seguradora_averbacao_mae text,
  ADD COLUMN IF NOT EXISTS seguradora_api_endpoint text,
  ADD COLUMN IF NOT EXISTS seguradora_api_key text,
  ADD COLUMN IF NOT EXISTS provedor_nome text,
  ADD COLUMN IF NOT EXISTS provedor_ambiente text DEFAULT 'homologacao',
  ADD COLUMN IF NOT EXISTS provedor_api_key_homolog text,
  ADD COLUMN IF NOT EXISTS provedor_api_key_prod text,
  ADD COLUMN IF NOT EXISTS ciot_provedor text,
  ADD COLUMN IF NOT EXISTS ciot_api_key text,
  ADD COLUMN IF NOT EXISTS cfop_intra text DEFAULT '5351',
  ADD COLUMN IF NOT EXISTS cfop_inter text DEFAULT '6351';

-- 2. Expandir veiculos com dados MDF-e
ALTER TABLE public.veiculos
  ADD COLUMN IF NOT EXISTS renavam text,
  ADD COLUMN IF NOT EXISTS tara_kg integer,
  ADD COLUMN IF NOT EXISTS capacidade_kg integer,
  ADD COLUMN IF NOT EXISTS capacidade_m3 numeric(10,2),
  ADD COLUMN IF NOT EXISTS tipo_rodado text,
  ADD COLUMN IF NOT EXISTS tipo_carroceria text,
  ADD COLUMN IF NOT EXISTS combustivel text,
  ADD COLUMN IF NOT EXISTS uf_licenciamento text,
  ADD COLUMN IF NOT EXISTS proprietario_tipo text,
  ADD COLUMN IF NOT EXISTS proprietario_cnpj_cpf text,
  ADD COLUMN IF NOT EXISTS proprietario_razao text,
  ADD COLUMN IF NOT EXISTS proprietario_rntrc text,
  ADD COLUMN IF NOT EXISTS proprietario_ie text,
  ADD COLUMN IF NOT EXISTS proprietario_uf text;

-- 3. Nova tabela motoristas
CREATE TABLE IF NOT EXISTS public.motoristas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text NOT NULL UNIQUE,
  cnh_numero text,
  cnh_categoria text,
  cnh_validade date,
  telefone text,
  email text,
  eh_tac boolean NOT NULL DEFAULT false,
  rntrc text,
  banco text,
  agencia text,
  conta text,
  pix_chave text,
  pix_tipo text,
  ativo boolean NOT NULL DEFAULT true,
  observacoes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.motoristas TO authenticated;
GRANT ALL ON public.motoristas TO service_role;
ALTER TABLE public.motoristas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "motoristas_select_auth" ON public.motoristas FOR SELECT TO authenticated USING (is_active_operator());
CREATE POLICY "motoristas_insert_auth" ON public.motoristas FOR INSERT TO authenticated WITH CHECK (is_active_operator());
CREATE POLICY "motoristas_update_auth" ON public.motoristas FOR UPDATE TO authenticated USING (is_active_operator());
CREATE POLICY "motoristas_delete_auth" ON public.motoristas FOR DELETE TO authenticated USING (is_active_operator());
CREATE TRIGGER update_motoristas_updated_at BEFORE UPDATE ON public.motoristas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Zonas de entrega (cidade/UF -> zona lógica de tarifa)
CREATE TABLE IF NOT EXISTS public.zonas_entrega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embarcador_id uuid REFERENCES public.embarcadores(id) ON DELETE CASCADE,
  uf text NOT NULL,
  municipio text NOT NULL,
  codigo_municipio_ibge text,
  zona text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (embarcador_id, uf, municipio)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.zonas_entrega TO authenticated;
GRANT ALL ON public.zonas_entrega TO service_role;
ALTER TABLE public.zonas_entrega ENABLE ROW LEVEL SECURITY;
CREATE POLICY "zonas_all_auth" ON public.zonas_entrega FOR ALL TO authenticated
  USING (is_active_operator()) WITH CHECK (is_active_operator());
CREATE INDEX IF NOT EXISTS idx_zonas_entrega_uf_mun ON public.zonas_entrega(uf, municipio);

-- 5. Tabelas de frete (cabeçalho versionado)
CREATE TABLE IF NOT EXISTS public.tabelas_frete (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  embarcador_id uuid NOT NULL REFERENCES public.embarcadores(id) ON DELETE CASCADE,
  nome text NOT NULL,
  vigente_de date NOT NULL,
  vigente_ate date,
  moeda text NOT NULL DEFAULT 'BRL',
  frete_minimo numeric(12,2),
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabelas_frete TO authenticated;
GRANT ALL ON public.tabelas_frete TO service_role;
ALTER TABLE public.tabelas_frete ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tab_frete_all_auth" ON public.tabelas_frete FOR ALL TO authenticated
  USING (is_active_operator()) WITH CHECK (is_active_operator());
CREATE TRIGGER update_tab_frete_updated_at BEFORE UPDATE ON public.tabelas_frete
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6. Faixas da tabela de frete (zona x tipo carga x faixa de peso)
CREATE TABLE IF NOT EXISTS public.tabelas_frete_faixas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tabela_id uuid NOT NULL REFERENCES public.tabelas_frete(id) ON DELETE CASCADE,
  zona text NOT NULL,
  tipo_carga text NOT NULL,
  peso_min_kg numeric(10,2) NOT NULL DEFAULT 0,
  peso_max_kg numeric(10,2),
  tarifa_por_ton numeric(12,4),
  tarifa_fixa numeric(12,4),
  pedagio_por_100kg numeric(12,4) DEFAULT 0,
  adicional_cte numeric(12,4) DEFAULT 0,
  gris_percentual numeric(6,4) DEFAULT 0,
  advalorem_percentual numeric(6,4) DEFAULT 0,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tabelas_frete_faixas TO authenticated;
GRANT ALL ON public.tabelas_frete_faixas TO service_role;
ALTER TABLE public.tabelas_frete_faixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tab_frete_faixas_all_auth" ON public.tabelas_frete_faixas FOR ALL TO authenticated
  USING (is_active_operator()) WITH CHECK (is_active_operator());
CREATE INDEX IF NOT EXISTS idx_tab_frete_faixas_tabela ON public.tabelas_frete_faixas(tabela_id);

-- 7. Convênios fiscais (isenção MG, regimes especiais, etc.)
CREATE TABLE IF NOT EXISTS public.convenios_fiscais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  uf_origem text,
  uf_destino text,
  cnpj_root_embarcador text,
  cfop_forcado text,
  cst_icms text,
  aliquota_icms numeric(5,2),
  reducao_base numeric(5,2),
  texto_infadfisco text,
  texto_infcpl text,
  base_legal text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.convenios_fiscais TO authenticated;
GRANT ALL ON public.convenios_fiscais TO service_role;
ALTER TABLE public.convenios_fiscais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "convenios_all_auth" ON public.convenios_fiscais FOR ALL TO authenticated
  USING (is_active_operator()) WITH CHECK (is_active_operator());
CREATE TRIGGER update_convenios_updated_at BEFORE UPDATE ON public.convenios_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 8. Expandir embarcadores
ALTER TABLE public.embarcadores
  ADD COLUMN IF NOT EXISTS tabela_frete_id uuid REFERENCES public.tabelas_frete(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS tipo_operacao_padrao text,
  ADD COLUMN IF NOT EXISTS tomador_servico smallint,
  ADD COLUMN IF NOT EXISTS cnae text;

-- 9. Seed inicial: Convênio Pandurata MG->RJ (isenção ICMS)
INSERT INTO public.convenios_fiscais
  (nome, descricao, uf_origem, uf_destino, cnpj_root_embarcador, cfop_forcado, cst_icms, aliquota_icms, texto_infadfisco, base_legal)
SELECT
  'Pandurata MG->RJ - Isenção ICMS',
  'Convênio de isenção para cargas Pandurata originadas em Extrema/MG',
  'MG', 'RJ', '70940994',
  '6932', '41', 0,
  'Prestação isenta de ICMS conforme Decreto MG 46.266/2013',
  'Decreto MG 46.266/2013'
WHERE NOT EXISTS (
  SELECT 1 FROM public.convenios_fiscais WHERE cnpj_root_embarcador='70940994' AND uf_origem='MG'
);
