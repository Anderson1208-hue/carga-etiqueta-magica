CREATE OR REPLACE FUNCTION public.validate_monitoramento_parada_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status NOT IN ('programada','em_rota','chegou_cliente','em_atendimento','visitada','finalizada','pulada','parada_excessiva','fora_sequencia','visita_inconsistente') THEN
    RAISE EXCEPTION 'status de parada inválido: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;