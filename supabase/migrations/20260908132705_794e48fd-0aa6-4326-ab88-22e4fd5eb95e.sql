ALTER TABLE public.okentrega_queue DROP CONSTRAINT IF EXISTS okentrega_queue_status_check;
ALTER TABLE public.okentrega_queue ADD CONSTRAINT okentrega_queue_status_check
  CHECK (status IN ('pendente','processando','aguardando_aprovacao','aprovado','recusado','revisao','erro','bloqueado','enviado')) NOT VALID;

ALTER TABLE public.okentrega_queue
  ADD COLUMN IF NOT EXISTS imagem_enviada_path text,
  ADD COLUMN IF NOT EXISTS imagem_origem text,
  ADD COLUMN IF NOT EXISTS validacao_imagem jsonb,
  ADD COLUMN IF NOT EXISTS validado_em timestamptz,
  ADD COLUMN IF NOT EXISTS processamento_iniciado_em timestamptz,
  ADD COLUMN IF NOT EXISTS conciliado_em timestamptz;

DROP INDEX IF EXISTS public.okentrega_queue_baixa_ativa_uidx;
CREATE UNIQUE INDEX okentrega_queue_baixa_ativa_uidx
  ON public.okentrega_queue (baixa_id)
  WHERE baixa_id IS NOT NULL AND status IN ('pendente','processando','aguardando_aprovacao','aprovado','revisao','bloqueado');

CREATE INDEX IF NOT EXISTS idx_okentrega_queue_conciliacao
  ON public.okentrega_queue (status, enviado_em)
  WHERE status IN ('aguardando_aprovacao','recusado','revisao');

CREATE OR REPLACE FUNCTION public.okentrega_reservar_item(p_queue_id uuid DEFAULT NULL)
RETURNS SETOF public.okentrega_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT q.id INTO v_id
  FROM public.okentrega_queue q
  WHERE q.status = 'pendente'
    AND (p_queue_id IS NULL OR q.id = p_queue_id)
  ORDER BY q.created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE public.okentrega_queue q
  SET status = 'processando', processamento_iniciado_em = now(), erro_mensagem = NULL
  WHERE q.id = v_id AND q.status = 'pendente'
  RETURNING q.*;
END;
$$;

REVOKE ALL ON FUNCTION public.okentrega_reservar_item(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okentrega_reservar_item(uuid) TO service_role;

UPDATE public.okentrega_config
SET blocklist_nfs = ARRAY(
  SELECT DISTINCT v
  FROM unnest(
    coalesce(blocklist_nfs, '{}'::text[]) ||
    ARRAY['758314','757126','758307','758306','758902','758215','757131','757427','758226','753709','757122','757130','758315','757121','758302','758303','758304','756180','758598']::text[]
  ) AS v
), updated_at = now()
WHERE id = true;

UPDATE public.okentrega_queue
SET status = 'bloqueado',
    erro_mensagem = 'Bloqueado: ocorrência tratada diretamente no portal; retransmissão proibida em 08/09/2026'
WHERE numero_nf IN ('758314','757126','758307','758306','758902','758215','757131','757427','758226','753709','757122','757130','758315','757121','758302','758303','758304','756180','758598')
  AND status <> 'aprovado';

ALTER TABLE public.okentrega_queue VALIDATE CONSTRAINT okentrega_queue_status_check;