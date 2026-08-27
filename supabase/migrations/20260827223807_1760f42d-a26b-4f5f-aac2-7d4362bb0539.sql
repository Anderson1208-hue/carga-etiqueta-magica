CREATE UNIQUE INDEX IF NOT EXISTS okentrega_queue_baixa_ativa_uidx
  ON public.okentrega_queue (baixa_id)
  WHERE baixa_id IS NOT NULL AND status IN ('pendente','enviado');