-- Configuração
CREATE TABLE public.okentrega_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  ambiente text NOT NULL DEFAULT 'homolog' CHECK (ambiente IN ('homolog','producao')),
  envio_ativo boolean NOT NULL DEFAULT false,
  entregador_id_homolog integer,
  entregador_id_producao integer,
  cnpj_transportadora text,
  whitelist_nfs text[] NOT NULL DEFAULT '{}',
  modo_imagem text NOT NULL DEFAULT 'contain' CHECK (modo_imagem IN ('contain','stretch','cover')),
  max_tentativas integer NOT NULL DEFAULT 5,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.okentrega_config TO authenticated;
GRANT ALL ON public.okentrega_config TO service_role;
ALTER TABLE public.okentrega_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam config okentrega" ON public.okentrega_config FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());

-- Cache de token por ambiente
CREATE TABLE public.okentrega_token (
  ambiente text PRIMARY KEY CHECK (ambiente IN ('homolog','producao')),
  token text NOT NULL,
  expira_em timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.okentrega_token TO service_role;
ALTER TABLE public.okentrega_token ENABLE ROW LEVEL SECURITY;

-- Fila
CREATE TABLE public.okentrega_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id uuid,
  baixa_id uuid,
  chave_acesso text,
  numero_nf text,
  tipo_ocorrencia_id integer NOT NULL DEFAULT 1,
  tipo_entrega text NOT NULL DEFAULT 'F',
  ambiente text NOT NULL DEFAULT 'homolog',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','erro')),
  tentativas integer NOT NULL DEFAULT 0,
  ultima_tentativa_em timestamptz,
  enviado_em timestamptz,
  erro_mensagem text,
  ocorrencia_entrega_id text,
  status_baixa text,
  status_comprovante text,
  motivo_recusa text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_okentrega_queue_status ON public.okentrega_queue (status, created_at);
CREATE INDEX idx_okentrega_queue_baixa ON public.okentrega_queue (baixa_id);
CREATE INDEX idx_okentrega_queue_chave ON public.okentrega_queue (chave_acesso);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.okentrega_queue TO authenticated;
GRANT ALL ON public.okentrega_queue TO service_role;
ALTER TABLE public.okentrega_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins gerenciam fila okentrega" ON public.okentrega_queue FOR ALL TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "Operadores visualizam fila okentrega" ON public.okentrega_queue FOR SELECT TO authenticated USING (is_active_operator());

-- Log de chamadas
CREATE TABLE public.okentrega_log_envios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid,
  endpoint text,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  duracao_ms integer,
  sucesso boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_okentrega_log_queue ON public.okentrega_log_envios (queue_id, created_at DESC);

GRANT SELECT ON public.okentrega_log_envios TO authenticated;
GRANT ALL ON public.okentrega_log_envios TO service_role;
ALTER TABLE public.okentrega_log_envios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins visualizam log okentrega" ON public.okentrega_log_envios FOR SELECT TO authenticated USING (is_admin());

-- Marcações na baixa
ALTER TABLE public.baixas_entrega
  ADD COLUMN IF NOT EXISTS okentrega_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS okentrega_ultimo_erro text,
  ADD COLUMN IF NOT EXISTS okentrega_tentativas integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS okentrega_queue_id uuid;

-- Seed config com dados do e-mail da OK Entrega
INSERT INTO public.okentrega_config (id, ambiente, envio_ativo, entregador_id_homolog, entregador_id_producao)
VALUES (true, 'homolog', false, 29668, 85852)
ON CONFLICT (id) DO NOTHING;