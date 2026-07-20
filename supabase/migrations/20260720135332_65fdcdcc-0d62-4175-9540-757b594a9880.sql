-- Corrige horários de saída inferidos pela chegada da próxima parada.
-- Regra factual: a saída da parada passa a ser o último ping GPS ainda dentro do geofence,
-- nunca o horário de chegada em outro cliente.
WITH cfg AS (
  SELECT
    COALESCE(raio_padrao_metros, 200) AS raio_padrao_metros,
    COALESCE(tolerancia_gps_metros, 30) AS tolerancia_gps_metros,
    COALESCE(tempo_minimo_atendimento_min, 5) AS tempo_minimo_atendimento_min
  FROM public.monitoramento_config
  LIMIT 1
), candidatas AS (
  SELECT
    p.id,
    p.monitoramento_rota_id,
    p.latitude::float8 AS lat,
    p.longitude::float8 AS lng,
    p.horario_chegada,
    p.horario_saida,
    (COALESCE(p.raio_geofence_metros, cfg.raio_padrao_metros) + cfg.tolerancia_gps_metros)::float8 AS raio_total,
    cfg.tempo_minimo_atendimento_min
  FROM public.monitoramento_paradas p
  JOIN public.monitoramento_paradas prox
    ON prox.monitoramento_rota_id = p.monitoramento_rota_id
   AND prox.ordem = p.ordem + 1
   AND prox.horario_chegada = p.horario_saida
  CROSS JOIN cfg
  WHERE p.horario_chegada IS NOT NULL
    AND p.horario_saida IS NOT NULL
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND p.status IN ('finalizada', 'visita_inconsistente', 'em_atendimento', 'chegou_cliente', 'parada_excessiva', 'fora_sequencia')
), gps_inside AS (
  SELECT
    c.id,
    MAX(g.registrado_em) AS ultimo_ping_dentro,
    c.horario_chegada,
    c.horario_saida,
    c.tempo_minimo_atendimento_min
  FROM candidatas c
  JOIN public.posicoes_gps g
    ON g.monitoramento_rota_id = c.monitoramento_rota_id
   AND COALESCE(g.heartbeat, false) = false
   AND g.registrado_em >= c.horario_chegada
   AND g.registrado_em < c.horario_saida
   AND g.latitude IS NOT NULL
   AND g.longitude IS NOT NULL
   AND (
     6371000 * 2 * asin(sqrt(
       power(sin(radians((g.latitude::float8 - c.lat) / 2)), 2) +
       cos(radians(c.lat)) * cos(radians(g.latitude::float8)) *
       power(sin(radians((g.longitude::float8 - c.lng) / 2)), 2)
     ))
   ) <= c.raio_total
  GROUP BY c.id, c.horario_chegada, c.horario_saida, c.tempo_minimo_atendimento_min
), corrigidas AS (
  UPDATE public.monitoramento_paradas p
  SET
    horario_saida = gi.ultimo_ping_dentro,
    tempo_permanencia_min = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (gi.ultimo_ping_dentro - gi.horario_chegada)) / 60)::int),
    status = CASE
      WHEN GREATEST(0, ROUND(EXTRACT(EPOCH FROM (gi.ultimo_ping_dentro - gi.horario_chegada)) / 60)::int) < gi.tempo_minimo_atendimento_min
      THEN 'visita_inconsistente'
      ELSE 'finalizada'
    END,
    is_excecao = GREATEST(0, ROUND(EXTRACT(EPOCH FROM (gi.ultimo_ping_dentro - gi.horario_chegada)) / 60)::int) < gi.tempo_minimo_atendimento_min
  FROM gps_inside gi
  WHERE p.id = gi.id
    AND gi.ultimo_ping_dentro < p.horario_saida
    AND gi.ultimo_ping_dentro >= p.horario_chegada
  RETURNING p.monitoramento_rota_id
)
UPDATE public.monitoramento_rotas r
SET paradas_concluidas = sub.done
FROM (
  SELECT monitoramento_rota_id, COUNT(*) FILTER (WHERE status IN ('finalizada','pulada','visita_inconsistente')) AS done
  FROM public.monitoramento_paradas
  WHERE monitoramento_rota_id IN (SELECT monitoramento_rota_id FROM corrigidas)
  GROUP BY monitoramento_rota_id
) sub
WHERE r.id = sub.monitoramento_rota_id;