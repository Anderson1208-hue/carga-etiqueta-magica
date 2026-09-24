CREATE OR REPLACE FUNCTION public.okentrega_reservar_item(p_queue_id uuid DEFAULT NULL::uuid)
 RETURNS SETOF okentrega_queue
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
BEGIN
  -- Reservas órfãs (worker morreu antes do POST): volta para pendente.
  UPDATE public.okentrega_queue
     SET status = 'pendente', processamento_iniciado_em = NULL
   WHERE status = 'processando'
     AND enviado_em IS NULL
     AND ocorrencia_entrega_id IS NULL
     AND processamento_iniciado_em < now() - interval '15 minutes';

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
$function$;

UPDATE public.okentrega_queue
   SET status = 'pendente', processamento_iniciado_em = NULL, erro_mensagem = NULL
 WHERE numero_nf IN ('761004','760136','761006')
   AND enviado_em IS NULL AND ocorrencia_entrega_id IS NULL;