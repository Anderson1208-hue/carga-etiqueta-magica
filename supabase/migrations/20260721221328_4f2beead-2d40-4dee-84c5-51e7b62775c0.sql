DROP TRIGGER IF EXISTS trg_sync_parada_from_baixa ON public.baixas_entrega;

CREATE OR REPLACE FUNCTION public.fn_sync_parada_from_baixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Intencionalmente sem ação.
  -- Regra operacional a partir de 2026-07-21:
  -- baixa_entrega NÃO alimenta status, chegada, saída, permanência,
  -- exceção ou localização de monitoramento_paradas/monitoramento_rotas.
  -- A Torre de Controle deve usar somente posicoes_gps factuais.
  RETURN NEW;
END;
$function$;

WITH suspect AS (
  SELECT DISTINCT mp.id
  FROM public.monitoramento_paradas mp
  JOIN public.monitoramento_rotas mr ON mr.id = mp.monitoramento_rota_id
  JOIN public.baixas_entrega be ON be.veiculo_id = mr.veiculo_id
  JOIN public.notas_fiscais nf ON nf.id = be.nf_id AND nf.cnpj_destinatario = mp.cnpj_destinatario
  WHERE mr.data >= current_date - interval '3 days'
    AND mr.status IN ('aguardando','ativa','pausada')
    AND be.status = 'entregue'
    AND be.registrado_em >= current_date - interval '3 days'
    AND mp.status = 'finalizada'
    AND mp.horario_chegada IS NOT NULL
    AND mp.horario_saida IS NOT NULL
    AND abs(extract(epoch FROM (mp.horario_saida - mp.horario_chegada))) <= 120
    AND abs(extract(epoch FROM (be.registrado_em - mp.horario_chegada))) <= 2
)
UPDATE public.monitoramento_paradas mp
SET status = 'programada',
    horario_chegada = NULL,
    horario_saida = NULL,
    tempo_permanencia_min = NULL,
    is_excecao = false,
    justificativa = NULL,
    justificativa_tipo = NULL,
    justificativa_por = NULL,
    justificativa_em = NULL
FROM suspect s
WHERE mp.id = s.id;

WITH rotas_afetadas AS (
  SELECT DISTINCT mp.monitoramento_rota_id AS id
  FROM public.monitoramento_paradas mp
  JOIN public.monitoramento_rotas mr ON mr.id = mp.monitoramento_rota_id
  WHERE mr.data >= current_date - interval '3 days'
    AND mr.status IN ('aguardando','ativa','pausada')
), contagem AS (
  SELECT monitoramento_rota_id,
         count(*) FILTER (WHERE status = 'finalizada') AS finalizadas,
         count(*) AS total
  FROM public.monitoramento_paradas
  WHERE monitoramento_rota_id IN (SELECT id FROM rotas_afetadas)
  GROUP BY monitoramento_rota_id
)
UPDATE public.monitoramento_rotas mr
SET paradas_concluidas = c.finalizadas,
    total_paradas = c.total,
    status = CASE WHEN mr.status = 'finalizada' THEN 'ativa' ELSE mr.status END
FROM contagem c
WHERE mr.id = c.monitoramento_rota_id;