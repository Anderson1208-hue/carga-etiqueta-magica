UPDATE public.monitoramento_config SET raio_padrao_metros = 500;

UPDATE public.monitoramento_paradas
SET raio_geofence_metros = 500
WHERE raio_geofence_metros < 500
  AND status IN ('aguardando','em_atendimento','em_deslocamento','pendente');