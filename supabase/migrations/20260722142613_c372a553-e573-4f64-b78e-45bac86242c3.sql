
CREATE OR REPLACE FUNCTION public.fn_sync_parada_from_baixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnpj text;
  v_veiculo_id uuid;
  v_rota_id uuid;
  v_parada_id uuid;
  v_total int;
  v_concl int;
BEGIN
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  IF NEW.status IS DISTINCT FROM 'entregue' THEN RETURN NEW; END IF;

  SELECT nf.cnpj_destinatario INTO v_cnpj
    FROM notas_fiscais nf WHERE nf.id = NEW.nf_id;
  IF v_cnpj IS NULL THEN RETURN NEW; END IF;

  SELECT vn.veiculo_id INTO v_veiculo_id
    FROM veiculo_nfs vn WHERE vn.nf_id = NEW.nf_id
    ORDER BY vn.veiculo_id LIMIT 1;
  IF v_veiculo_id IS NULL THEN RETURN NEW; END IF;

  SELECT r.id INTO v_rota_id
    FROM monitoramento_rotas r
    WHERE r.veiculo_id = v_veiculo_id
      AND r.status IN ('ativa','aguardando','pausada')
    ORDER BY r.data DESC, r.created_at DESC LIMIT 1;
  IF v_rota_id IS NULL THEN
    SELECT r.id INTO v_rota_id
      FROM monitoramento_rotas r
      WHERE r.veiculo_id = v_veiculo_id
      ORDER BY r.data DESC, r.created_at DESC LIMIT 1;
  END IF;
  IF v_rota_id IS NULL THEN RETURN NEW; END IF;

  SELECT p.id INTO v_parada_id
    FROM monitoramento_paradas p
    WHERE p.monitoramento_rota_id = v_rota_id
      AND p.cnpj_destinatario = v_cnpj
      AND p.status <> 'finalizada'
    ORDER BY p.ordem LIMIT 1;

  IF v_parada_id IS NOT NULL THEN
    UPDATE monitoramento_paradas
       SET status = 'finalizada'
     WHERE id = v_parada_id;
  END IF;

  SELECT COUNT(*), COUNT(*) FILTER (WHERE status = 'finalizada')
    INTO v_total, v_concl
    FROM monitoramento_paradas
    WHERE monitoramento_rota_id = v_rota_id;

  UPDATE monitoramento_rotas
     SET paradas_concluidas = v_concl,
         status = CASE WHEN v_total > 0 AND v_concl >= v_total AND status <> 'finalizada'
                       THEN 'finalizada' ELSE status END
   WHERE id = v_rota_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_parada_from_baixa ON public.baixas_entrega;
CREATE TRIGGER trg_sync_parada_from_baixa
AFTER INSERT OR UPDATE OF status ON public.baixas_entrega
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_parada_from_baixa();

-- Reconciliar baixas recentes (executa a função via UPDATE no-op para acionar o trigger)
UPDATE public.baixas_entrega
   SET status = status
 WHERE status = 'entregue'
   AND registrado_em >= now() - interval '3 days';
