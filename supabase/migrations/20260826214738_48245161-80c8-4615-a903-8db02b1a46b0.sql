CREATE OR REPLACE FUNCTION public.validate_status_entrega()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status_entrega NOT IN ('CARGA NO DEPOSITO', 'NF EM ROTA', 'ENTREGUE', 'RECUSADO', 'PENDENCIA DE BAIXA') THEN
    RAISE EXCEPTION 'status_entrega inválido: %', NEW.status_entrega;
  END IF;
  RETURN NEW;
END;
$$;