
-- ============================================
-- IBAC Integration: De-Para de Eventos
-- ============================================
CREATE TABLE public.ibac_de_para_eventos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_interno text NOT NULL UNIQUE,
  descricao_interna text NOT NULL,
  codigo_ibac text,
  descricao_ibac text,
  ativo boolean NOT NULL DEFAULT true,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ibac_de_para_eventos TO authenticated;
GRANT ALL ON public.ibac_de_para_eventos TO service_role;

ALTER TABLE public.ibac_de_para_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam de_para ibac"
ON public.ibac_de_para_eventos
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Operadores podem visualizar de_para ibac"
ON public.ibac_de_para_eventos
FOR SELECT
TO authenticated
USING (is_active_operator());

CREATE TRIGGER trg_ibac_de_para_updated_at
BEFORE UPDATE ON public.ibac_de_para_eventos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Pré-popular com os eventos propostos (códigos IBAC ficam null até confirmação)
INSERT INTO public.ibac_de_para_eventos (evento_interno, descricao_interna, codigo_ibac, descricao_ibac) VALUES
  ('carga_aceita', 'Carga aceita pela transportadora', NULL, 'Aguardando código IBAC (proposto: 222)'),
  ('inicio_rota', 'Motorista iniciou a rota', NULL, 'Aguardando código IBAC (proposto: 244)'),
  ('chegada_cliente', 'Chegada no cliente', NULL, 'Aguardando código IBAC (proposto: 245)'),
  ('entrega_realizada', 'Entrega realizada com canhoto', NULL, 'Aguardando código IBAC (proposto: 1)'),
  ('avaria', 'Avaria identificada', NULL, 'Aguardando código IBAC (proposto: 78/79/88)'),
  ('recusa_entrega', 'Entrega recusada pelo destinatário', NULL, 'Aguardando código IBAC'),
  ('agendamento', 'Entrega agendada', NULL, 'Aguardando código IBAC (proposto: 91)'),
  ('reentrega', 'Reentrega solicitada', NULL, 'Aguardando código IBAC'),
  ('devolucao', 'Devolução para o embarcador', NULL, 'Aguardando código IBAC');

-- ============================================
-- IBAC Integration: Fila de eventos
-- ============================================
CREATE TABLE public.ibac_eventos_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  evento_interno text NOT NULL,
  nf_id uuid,
  carga_id uuid,
  baixa_id uuid,
  chave_acesso text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pendente',
  tentativas int NOT NULL DEFAULT 0,
  ultima_tentativa_em timestamptz,
  enviado_em timestamptz,
  erro_mensagem text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ibac_queue_status ON public.ibac_eventos_queue (status, created_at);
CREATE INDEX idx_ibac_queue_nf ON public.ibac_eventos_queue (nf_id);
CREATE INDEX idx_ibac_queue_carga ON public.ibac_eventos_queue (carga_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ibac_eventos_queue TO authenticated;
GRANT ALL ON public.ibac_eventos_queue TO service_role;

ALTER TABLE public.ibac_eventos_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam fila ibac"
ON public.ibac_eventos_queue
FOR ALL
TO authenticated
USING (is_admin())
WITH CHECK (is_admin());

CREATE POLICY "Operadores visualizam fila ibac"
ON public.ibac_eventos_queue
FOR SELECT
TO authenticated
USING (is_active_operator());

CREATE TRIGGER trg_ibac_queue_updated_at
BEFORE UPDATE ON public.ibac_eventos_queue
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Validação de status
CREATE OR REPLACE FUNCTION public.validate_ibac_queue_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pendente','enviado','erro','cancelado') THEN
    RAISE EXCEPTION 'status ibac inválido: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_ibac_queue_status
BEFORE INSERT OR UPDATE ON public.ibac_eventos_queue
FOR EACH ROW EXECUTE FUNCTION public.validate_ibac_queue_status();

-- ============================================
-- IBAC Integration: Log de envios (auditoria)
-- ============================================
CREATE TABLE public.ibac_log_envios (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  queue_id uuid,
  endpoint text,
  request_body jsonb,
  response_status int,
  response_body jsonb,
  duracao_ms int,
  sucesso boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ibac_log_queue ON public.ibac_log_envios (queue_id);
CREATE INDEX idx_ibac_log_created ON public.ibac_log_envios (created_at DESC);

GRANT SELECT, INSERT ON public.ibac_log_envios TO authenticated;
GRANT ALL ON public.ibac_log_envios TO service_role;

ALTER TABLE public.ibac_log_envios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins visualizam log ibac"
ON public.ibac_log_envios
FOR SELECT
TO authenticated
USING (is_admin());

CREATE POLICY "Service role insere log ibac"
ON public.ibac_log_envios
FOR INSERT
TO authenticated
WITH CHECK (true);
