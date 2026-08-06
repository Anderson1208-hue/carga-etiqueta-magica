ALTER TABLE public.embarcador_regiao_tarifas
  ADD COLUMN IF NOT EXISTS componentes_extra jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.componentes_frete_catalogo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text NOT NULL UNIQUE,
  nome text NOT NULL,
  nome_dacte text,
  tipo_calculo text NOT NULL CHECK (tipo_calculo IN ('percentual_nf','percentual_frete','valor_por_ton','valor_por_100kg','valor_fixo','valor_por_entrega')),
  descricao text,
  ordem integer NOT NULL DEFAULT 100,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.componentes_frete_catalogo TO authenticated;
GRANT ALL ON public.componentes_frete_catalogo TO service_role;

ALTER TABLE public.componentes_frete_catalogo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestao comercial gerencia catalogo de componentes"
  ON public.componentes_frete_catalogo FOR ALL TO authenticated
  USING (public.pode_gestao_comercial())
  WITH CHECK (public.pode_gestao_comercial());

DROP TRIGGER IF EXISTS trg_componentes_frete_catalogo_updated_at ON public.componentes_frete_catalogo;
CREATE TRIGGER trg_componentes_frete_catalogo_updated_at
  BEFORE UPDATE ON public.componentes_frete_catalogo
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.componentes_frete_catalogo (codigo, nome, nome_dacte, tipo_calculo, descricao, ordem) VALUES
  ('FRETE_PESO',       'Frete peso',                 'FRETE PESO',  'valor_por_ton',     'Tarifa por tonelada aplicada ao peso cubado/taxado', 10),
  ('FRETE_VALOR',      'Frete valor (ad valorem)',   'FRETE VALOR', 'percentual_nf',     'Percentual sobre o valor da mercadoria', 20),
  ('GRIS',             'GRIS',                       'GRIS',        'percentual_nf',     'Gerenciamento de risco sobre o valor da mercadoria', 30),
  ('CAT',              'CAT / Adicional CT-e',       'CAT',         'valor_fixo',        'Valor fixo por CT-e emitido', 40),
  ('PEDAGIO',          'Pedágio',                    'PEDAGIO',     'valor_por_100kg',   'Pedágio por 100 kg conforme tabela', 50),
  ('OUTROS',           'Outros',                     'OUTROS',      'valor_fixo',        'Componente genérico do DACTE', 60),
  ('DESPACHO',         'Despacho / taxa administrativa', 'OUTROS',  'valor_fixo',        'Taxa administrativa por documento', 70),
  ('TDE',              'TDE - Taxa de dificuldade de entrega', 'OUTROS', 'valor_por_entrega', 'Local de difícil acesso', 80),
  ('TRT',              'TRT - Taxa de restrição de trânsito',  'OUTROS', 'valor_por_entrega', 'Restrição de circulação urbana', 90),
  ('ADICIONAL_ENTREGA','Adicional de entrega',       'OUTROS',      'valor_por_entrega', 'Entrega adicional no mesmo destino/roteiro', 100),
  ('REENTREGA',        'Reentrega',                  'OUTROS',      'valor_por_entrega', 'Nova tentativa de entrega', 110),
  ('DEVOLUCAO',        'Devolução',                  'OUTROS',      'valor_por_entrega', 'Retorno da mercadoria ao embarcador', 120),
  ('DESCARGA',         'Descarga / ajudante',        'OUTROS',      'valor_por_entrega', 'Mão de obra para descarga', 130),
  ('PALETIZACAO',      'Paletização',                'OUTROS',      'valor_fixo',        'Serviço de paletização', 140),
  ('ESTADIA',          'Estadia / diária',           'OUTROS',      'valor_fixo',        'Permanência do veículo além do previsto', 150),
  ('AGENDAMENTO',      'Taxa de agendamento',        'OUTROS',      'valor_por_entrega', 'Agendamento obrigatório no destinatário', 160),
  ('ESCOLTA',          'Escolta / segurança',        'OUTROS',      'valor_fixo',        'Escolta armada ou monitoramento dedicado', 170),
  ('FRETE_MINIMO',     'Frete mínimo',               NULL,          'valor_fixo',        'Piso do frete por CT-e', 180)
ON CONFLICT (codigo) DO NOTHING;