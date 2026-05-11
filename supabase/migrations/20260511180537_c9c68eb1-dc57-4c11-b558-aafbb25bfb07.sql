-- 1) Colunas aditivas em notas_fiscais
ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS serie text,
  ADD COLUMN IF NOT EXISTS valor_nf numeric(14,2);

-- 2) prefaturas (cabeçalho)
CREATE TABLE IF NOT EXISTS public.prefaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_cnpj text NOT NULL,
  cliente_nome text,
  periodo_inicio date,
  periodo_fim date,
  numero_prefatura_cliente text,
  data_recebimento date NOT NULL DEFAULT CURRENT_DATE,
  arquivo_origem_nome text,
  import_batch_id text UNIQUE,
  total_itens integer NOT NULL DEFAULT 0,
  total_valor_nf_cliente numeric(16,2) NOT NULL DEFAULT 0,
  total_valor_frete_cliente numeric(16,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'importada',
  observacao text,
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prefaturas_cliente_cnpj ON public.prefaturas(cliente_cnpj);
CREATE INDEX IF NOT EXISTS idx_prefaturas_status ON public.prefaturas(status);
CREATE INDEX IF NOT EXISTS idx_prefaturas_created_at ON public.prefaturas(created_at DESC);

ALTER TABLE public.prefaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view prefaturas"
  ON public.prefaturas FOR SELECT TO authenticated
  USING (is_admin() OR is_active_operator());
CREATE POLICY "Authenticated users can create prefaturas"
  ON public.prefaturas FOR INSERT TO authenticated
  WITH CHECK (has_profile());
CREATE POLICY "Users can update prefaturas"
  ON public.prefaturas FOR UPDATE TO authenticated
  USING (is_admin() OR is_active_operator());
CREATE POLICY "Admins can delete prefaturas"
  ON public.prefaturas FOR DELETE TO authenticated
  USING (is_admin());

CREATE TRIGGER trg_prefaturas_updated_at
  BEFORE UPDATE ON public.prefaturas
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) prefatura_itens (linhas brutas, imutáveis)
CREATE TABLE IF NOT EXISTS public.prefatura_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefatura_id uuid NOT NULL REFERENCES public.prefaturas(id) ON DELETE CASCADE,
  linha_arquivo integer,
  chave_acesso_cliente text,
  numero_nf_cliente text,
  serie_cliente text,
  cnpj_emitente_cliente text,
  cnpj_destinatario_cliente text,
  documento_transporte_cliente text,
  valor_nf_cliente numeric(14,2),
  valor_frete_cliente numeric(14,2),
  peso_cliente numeric(14,3),
  volumes_cliente integer,
  data_emissao_cliente date,
  referencia_interna_cliente text,
  raw_jsonb jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prefatura_itens_prefatura ON public.prefatura_itens(prefatura_id);
CREATE INDEX IF NOT EXISTS idx_prefatura_itens_chave ON public.prefatura_itens(chave_acesso_cliente);
CREATE INDEX IF NOT EXISTS idx_prefatura_itens_numero ON public.prefatura_itens(numero_nf_cliente);

ALTER TABLE public.prefatura_itens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view prefatura_itens"
  ON public.prefatura_itens FOR SELECT TO authenticated
  USING (is_admin() OR is_active_operator());
CREATE POLICY "Authenticated users can create prefatura_itens"
  ON public.prefatura_itens FOR INSERT TO authenticated
  WITH CHECK (has_profile());
CREATE POLICY "Admins can delete prefatura_itens"
  ON public.prefatura_itens FOR DELETE TO authenticated
  USING (is_admin());

-- 4) prefatura_conciliacao (resultado do match, regravável)
CREATE TABLE IF NOT EXISTS public.prefatura_conciliacao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefatura_id uuid NOT NULL REFERENCES public.prefaturas(id) ON DELETE CASCADE,
  prefatura_item_id uuid NOT NULL UNIQUE REFERENCES public.prefatura_itens(id) ON DELETE CASCADE,
  nf_id uuid,
  cte_id uuid,
  matched_by text,
  status_conciliacao text NOT NULL DEFAULT 'pendente',
  divergencias jsonb NOT NULL DEFAULT '{}'::jsonb,
  tolerancia_aplicada jsonb,
  conferido_por uuid,
  conferido_em timestamptz,
  observacao_manual text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prefatura_conc_prefatura ON public.prefatura_conciliacao(prefatura_id);
CREATE INDEX IF NOT EXISTS idx_prefatura_conc_status ON public.prefatura_conciliacao(status_conciliacao);
CREATE INDEX IF NOT EXISTS idx_prefatura_conc_nf ON public.prefatura_conciliacao(nf_id);

ALTER TABLE public.prefatura_conciliacao ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view prefatura_conciliacao"
  ON public.prefatura_conciliacao FOR SELECT TO authenticated
  USING (is_admin() OR is_active_operator());
CREATE POLICY "Authenticated users can create prefatura_conciliacao"
  ON public.prefatura_conciliacao FOR INSERT TO authenticated
  WITH CHECK (has_profile());
CREATE POLICY "Users can update prefatura_conciliacao"
  ON public.prefatura_conciliacao FOR UPDATE TO authenticated
  USING (is_admin() OR is_active_operator());
CREATE POLICY "Admins can delete prefatura_conciliacao"
  ON public.prefatura_conciliacao FOR DELETE TO authenticated
  USING (is_admin());

CREATE TRIGGER trg_prefatura_conc_updated_at
  BEFORE UPDATE ON public.prefatura_conciliacao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) prefatura_auditoria
CREATE TABLE IF NOT EXISTS public.prefatura_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  prefatura_id uuid NOT NULL REFERENCES public.prefaturas(id) ON DELETE CASCADE,
  prefatura_item_id uuid REFERENCES public.prefatura_itens(id) ON DELETE SET NULL,
  acao text NOT NULL,
  detalhes jsonb,
  user_id uuid,
  user_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_prefatura_aud_prefatura ON public.prefatura_auditoria(prefatura_id);
CREATE INDEX IF NOT EXISTS idx_prefatura_aud_created ON public.prefatura_auditoria(created_at DESC);

ALTER TABLE public.prefatura_auditoria ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view prefatura_auditoria"
  ON public.prefatura_auditoria FOR SELECT TO authenticated
  USING (is_admin() OR is_active_operator());
CREATE POLICY "Authenticated users can create prefatura_auditoria"
  ON public.prefatura_auditoria FOR INSERT TO authenticated
  WITH CHECK (has_profile());
CREATE POLICY "Admins can delete prefatura_auditoria"
  ON public.prefatura_auditoria FOR DELETE TO authenticated
  USING (is_admin());