CREATE OR REPLACE FUNCTION public.fn_sync_parada_from_baixa()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Reconcilia paradas em qualquer status não-finalizado, incluindo 'pulada' e 'visita_inconsistente'.
  -- Verdade da baixa (foto/GPS/recebedor) prevalece sobre inferência do geofence.
  SELECT id INTO v_parada_id
  FROM public.monitoramento_paradas
  WHERE monitoramento_rota_id = v_rota_id
    AND cnpj_destinatario = v_cnpj
    AND status <> 'finalizada'
  ORDER BY
    CASE status
      WHEN 'em_atendimento' THEN 1
      WHEN 'chegou_cliente' THEN 2
      WHEN 'fora_sequencia' THEN 3
      WHEN 'parada_excessiva' THEN 4
      WHEN 'visita_inconsistente' THEN 5
      WHEN 'pulada' THEN 6
      WHEN 'programada' THEN 7
      ELSE 8
    END,
    ordem
  LIMIT 1;

  IF v_parada_id IS NOT NULL THEN
    UPDATE public.monitoramento_paradas
       SET status = 'finalizada',
           horario_chegada = COALESCE(horario_chegada, v_ts),
           horario_saida = v_ts,
           tempo_permanencia_min = GREATEST(1,
             EXTRACT(EPOCH FROM (v_ts - COALESCE(horario_chegada, v_ts)))/60
           )::int,
           is_excecao = false
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
$function$;

-- Reconciliação retroativa: aplica a nova regra para baixas já existentes
-- de rotas ativas cujas paradas ficaram travadas em 'pulada' ou 'visita_inconsistente'.
WITH baixas_ativas AS (
  SELECT b.id, b.nf_id, b.veiculo_id, b.registrado_em,
         nf.cnpj_destinatario,
         r.id AS rota_id
  FROM public.baixas_entrega b
  JOIN public.notas_fiscais nf ON nf.id = b.nf_id
  JOIN public.monitoramento_rotas r
    ON r.veiculo_id = b.veiculo_id AND r.status = 'ativa'
  WHERE b.status = 'entregue'
    AND nf.cnpj_destinatario IS NOT NULL
),
paradas_alvo AS (
  SELECT DISTINCT ON (ba.rota_id, ba.cnpj_destinatario)
         ba.rota_id, ba.cnpj_destinatario,
         COALESCE(ba.registrado_em, now()) AS ts,
         p.id AS parada_id
  FROM baixas_ativas ba
  JOIN public.monitoramento_paradas p
    ON p.monitoramento_rota_id = ba.rota_id
   AND p.cnpj_destinatario = ba.cnpj_destinatario
   AND p.status IN ('pulada','visita_inconsistente')
  ORDER BY ba.rota_id, ba.cnpj_destinatario, ba.registrado_em DESC
)
UPDATE public.monitoramento_paradas mp
   SET status = 'finalizada',
       horario_chegada = COALESCE(mp.horario_chegada, pa.ts),
       horario_saida = pa.ts,
       tempo_permanencia_min = GREATEST(1,
         EXTRACT(EPOCH FROM (pa.ts - COALESCE(mp.horario_chegada, pa.ts)))/60
       )::int,
       is_excecao = false
  FROM paradas_alvo pa
 WHERE mp.id = pa.parada_id;

-- Recalcula paradas_concluidas das rotas ativas afetadas
UPDATE public.monitoramento_rotas r
   SET paradas_concluidas = sub.done,
       status = CASE WHEN sub.total > 0 AND sub.done >= sub.total THEN 'finalizada' ELSE r.status END
  FROM (
    SELECT monitoramento_rota_id,
           count(*) AS total,
           count(*) FILTER (WHERE status IN ('finalizada','pulada','visita_inconsistente')) AS done
    FROM public.monitoramento_paradas
    GROUP BY monitoramento_rota_id
  ) sub
 WHERE r.id = sub.monitoramento_rota_id
   AND r.status = 'ativa';