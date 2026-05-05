-- Ajusta trigger de sincronização de status: reentrega NÃO é RECUSADO,
-- libera a NF para voltar ao depósito (Preparação).
CREATE OR REPLACE FUNCTION public.fn_sync_nf_status_from_baixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_new_status text;
BEGIN
  IF NEW.status = 'entregue' THEN
    v_new_status := 'ENTREGUE';
  ELSIF lower(coalesce(NEW.ocorrencia, '')) = 'reentrega' THEN
    -- Reentrega: NF volta para o depósito para ser reagendada/reembarcada
    v_new_status := 'CARGA NO DEPOSITO';
  ELSE
    v_new_status := 'RECUSADO';
  END IF;

  UPDATE public.notas_fiscais
     SET status_entrega = v_new_status
   WHERE id = NEW.nf_id
     AND status_entrega IS DISTINCT FROM v_new_status;

  RETURN NEW;
END;
$function$;