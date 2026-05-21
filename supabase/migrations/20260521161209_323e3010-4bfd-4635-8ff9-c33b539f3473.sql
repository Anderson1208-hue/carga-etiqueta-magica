
CREATE OR REPLACE FUNCTION public.fn_sync_parada_from_baixa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnpj text;
  v_rota_id uuid;
  v_parada_id uuid;
  v_ts timestamptz;
  v_total int;
  v_done int;
BEGIN
  IF NEW.status <> 'entregue' THEN
    RETURN NEW;
  END IF;

  SELECT cnpj_destinatario INTO v_cnpj
  FROM public.notas_fiscais WHERE id = NEW.nf_id;

  IF v_cnpj IS NULL THEN RETURN NEW; END IF;

  SELECT id INTO v_rota_id
  FROM public.monitoramento_rotas
  WHERE veiculo_id = NEW.veiculo_id AND status = 'ativa'
  ORDER BY created_at DESC LIMIT 1;

  IF v_rota_id IS NULL THEN RETURN NEW; END IF;

  v_ts := COALESCE(NEW.registrado_em, now());

  SELECT id INTO v_parada_id
  FROM public.monitoramento_paradas
  WHERE monitoramento_rota_id = v_rota_id
    AND cnpj_destinatario = v_cnpj
    AND status NOT IN ('finalizada','pulada','visita_inconsistente')
  ORDER BY ordem LIMIT 1;

  IF v_parada_id IS NOT NULL THEN
    UPDATE public.monitoramento_paradas
       SET status = 'finalizada',
           horario_chegada = COALESCE(horario_chegada, v_ts),
           horario_saida = COALESCE(horario_saida, v_ts),
           tempo_permanencia_min = COALESCE(tempo_permanencia_min,
             GREATEST(1, EXTRACT(EPOCH FROM (v_ts - COALESCE(horario_chegada, v_ts)))/60)::int)
     WHERE id = v_parada_id;
  END IF;

  SELECT count(*), count(*) FILTER (WHERE status IN ('finalizada','pulada','visita_inconsistente'))
    INTO v_total, v_done
  FROM public.monitoramento_paradas
  WHERE monitoramento_rota_id = v_rota_id;

  UPDATE public.monitoramento_rotas
     SET paradas_concluidas = v_done,
         status = CASE WHEN v_total > 0 AND v_done >= v_total THEN 'finalizada' ELSE status END
   WHERE id = v_rota_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_parada_from_baixa ON public.baixas_entrega;
CREATE TRIGGER trg_sync_parada_from_baixa
AFTER INSERT OR UPDATE OF status ON public.baixas_entrega
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_parada_from_baixa();

-- Backfill: para todas as rotas ativas, fecha paradas cujo CNPJ já tem baixa entregue
WITH baixas_ok AS (
  SELECT DISTINCT mr.id AS rota_id, nf.cnpj_destinatario AS cnpj,
         max(be.registrado_em) AS ts
  FROM public.baixas_entrega be
  JOIN public.notas_fiscais nf ON nf.id = be.nf_id
  JOIN public.monitoramento_rotas mr ON mr.veiculo_id = be.veiculo_id AND mr.status = 'ativa'
  WHERE be.status = 'entregue'
  GROUP BY mr.id, nf.cnpj_destinatario
)
UPDATE public.monitoramento_paradas mp
   SET status = 'finalizada',
       horario_chegada = COALESCE(mp.horario_chegada, b.ts),
       horario_saida = COALESCE(mp.horario_saida, b.ts)
  FROM baixas_ok b
 WHERE mp.monitoramento_rota_id = b.rota_id
   AND mp.cnpj_destinatario = b.cnpj
   AND mp.status NOT IN ('finalizada','pulada','visita_inconsistente');

UPDATE public.monitoramento_rotas mr
   SET paradas_concluidas = sub.done,
       status = CASE WHEN sub.total > 0 AND sub.done >= sub.total THEN 'finalizada' ELSE mr.status END
  FROM (
    SELECT monitoramento_rota_id,
           count(*) AS total,
           count(*) FILTER (WHERE status IN ('finalizada','pulada','visita_inconsistente')) AS done
      FROM public.monitoramento_paradas
     GROUP BY monitoramento_rota_id
  ) sub
 WHERE mr.id = sub.monitoramento_rota_id
   AND mr.status = 'ativa';
