
-- Função que sincroniza status_entrega da NF a partir da baixa
CREATE OR REPLACE FUNCTION public.fn_sync_nf_status_from_baixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_status text;
BEGIN
  IF NEW.status = 'entregue' THEN
    v_new_status := 'ENTREGUE';
  ELSE
    v_new_status := 'RECUSADO';
  END IF;

  UPDATE public.notas_fiscais
     SET status_entrega = v_new_status
   WHERE id = NEW.nf_id
     AND status_entrega IS DISTINCT FROM v_new_status;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_nf_status_from_baixa ON public.baixas_entrega;
CREATE TRIGGER trg_sync_nf_status_from_baixa
AFTER INSERT OR UPDATE OF status ON public.baixas_entrega
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_nf_status_from_baixa();

-- Backfill: aplicar baixas existentes
UPDATE public.notas_fiscais nf
   SET status_entrega = CASE WHEN b.status = 'entregue' THEN 'ENTREGUE' ELSE 'RECUSADO' END
  FROM public.baixas_entrega b
 WHERE b.nf_id = nf.id
   AND nf.status_entrega IS DISTINCT FROM (CASE WHEN b.status = 'entregue' THEN 'ENTREGUE' ELSE 'RECUSADO' END);
