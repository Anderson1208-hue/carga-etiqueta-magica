CREATE OR REPLACE FUNCTION public.fn_sync_rota_placa_motorista()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF (NEW.placa IS DISTINCT FROM OLD.placa) OR (NEW.motorista IS DISTINCT FROM OLD.motorista) THEN
    UPDATE public.monitoramento_rotas
       SET placa = NEW.placa,
           motorista = NEW.motorista
     WHERE veiculo_id = NEW.id
       AND status <> 'finalizada';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_rota_placa_motorista ON public.veiculos;
CREATE TRIGGER trg_sync_rota_placa_motorista
AFTER UPDATE ON public.veiculos
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_rota_placa_motorista();

-- Correcao pontual das rotas de hoje (placa/motorista dessincronizados do cadastro)
UPDATE public.monitoramento_rotas r
   SET placa = v.placa,
       motorista = v.motorista
  FROM public.veiculos v
 WHERE v.id = r.veiculo_id
   AND r.data >= CURRENT_DATE - 1
   AND (r.placa IS DISTINCT FROM v.placa OR r.motorista IS DISTINCT FROM v.motorista);