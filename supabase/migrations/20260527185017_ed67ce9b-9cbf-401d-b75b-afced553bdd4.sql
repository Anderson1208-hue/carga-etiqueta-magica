
-- Configuração de limites de alerta da integração IBAC (singleton)
CREATE TABLE public.ibac_config_alertas (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  limite_pendentes int NOT NULL DEFAULT 100,
  limite_erros_15min int NOT NULL DEFAULT 10,
  cooldown_minutos int NOT NULL DEFAULT 30,
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ibac_config_alertas TO authenticated;
GRANT ALL ON public.ibac_config_alertas TO service_role;

ALTER TABLE public.ibac_config_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ler config alertas ibac"
ON public.ibac_config_alertas FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "Admin alterar config alertas ibac"
ON public.ibac_config_alertas FOR INSERT TO authenticated WITH CHECK (is_admin());

CREATE POLICY "Admin atualizar config alertas ibac"
ON public.ibac_config_alertas FOR UPDATE TO authenticated USING (is_admin());

INSERT INTO public.ibac_config_alertas (id) VALUES (true) ON CONFLICT DO NOTHING;

-- Alertas disparados pela integração IBAC
CREATE TABLE public.ibac_alertas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL,  -- 'fila_pendentes_alta' | 'erros_alta_taxa'
  mensagem text NOT NULL,
  valor_atual int,
  limite int,
  lido boolean NOT NULL DEFAULT false,
  lido_por uuid,
  lido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ibac_alertas_lido ON public.ibac_alertas (lido, created_at DESC);
CREATE INDEX idx_ibac_alertas_tipo_created ON public.ibac_alertas (tipo, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.ibac_alertas TO authenticated;
GRANT ALL ON public.ibac_alertas TO service_role;

ALTER TABLE public.ibac_alertas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operadores e admin veem alertas ibac"
ON public.ibac_alertas FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

CREATE POLICY "Operadores e admin marcam lido"
ON public.ibac_alertas FOR UPDATE TO authenticated
USING (is_admin() OR is_active_operator());

CREATE POLICY "Service role insere alertas"
ON public.ibac_alertas FOR INSERT TO authenticated WITH CHECK (is_admin());
