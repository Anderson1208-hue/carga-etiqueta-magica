ALTER TABLE public.okentrega_queue DROP CONSTRAINT IF EXISTS okentrega_queue_status_check;
ALTER TABLE public.okentrega_queue ADD CONSTRAINT okentrega_queue_status_check
  CHECK (status = ANY (ARRAY['pendente','enviado','erro','bloqueado']));

ALTER TABLE public.okentrega_config ADD COLUMN IF NOT EXISTS blocklist_nfs text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.okentrega_config
SET blocklist_nfs = ARRAY['754898','757000','755540','755537','758217','759515','747081','749728','749516','751022','746921']
WHERE id = true;

UPDATE public.okentrega_queue
SET status = 'bloqueado',
    erro_mensagem = 'Bloqueado manualmente: digitacao direta no portal do cliente (2026-09-02)'
WHERE status = 'pendente'
  AND numero_nf IN ('754898','757000','755540','755537','758217','759515','747081','749728','749516','751022','746921');