
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
    v_new_status := 'CARGA NO DEPOSITO';

    -- Libera a NF do veículo anterior
    DELETE FROM public.veiculo_nfs
     WHERE nf_id = NEW.nf_id;

    -- Limpa o agendamento antigo para a NF aparecer imediatamente na Preparação.
    -- O operador define a nova data manualmente depois.
    DELETE FROM public.agendamentos
     WHERE nf_id = NEW.nf_id;
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
