CREATE OR REPLACE FUNCTION public.validate_agendamento_status()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN ('AGENDAMENTO', 'AGUARDANDO AGENDA', 'AGUARDANDO REAGENDA', 'REENTREGA', 'DEVOLUCAO') THEN
    RAISE EXCEPTION 'status de agendamento inválido: %', NEW.status;
  END IF;
  IF NEW.status IN ('AGENDAMENTO', 'REENTREGA') AND NEW.data_agendamento IS NULL THEN
    RAISE EXCEPTION 'data_agendamento é obrigatória para status %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;