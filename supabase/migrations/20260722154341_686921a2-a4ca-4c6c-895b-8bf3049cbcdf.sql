
-- 1. Coordenadas do cluster suspeito no alerta (para operador ver no mapa)
ALTER TABLE public.alertas_monitoramento
  ADD COLUMN IF NOT EXISTS latitude numeric,
  ADD COLUMN IF NOT EXISTS longitude numeric,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_alertas_tipo_rota_created
  ON public.alertas_monitoramento (tipo, monitoramento_rota_id, created_at DESC);

-- 2. RPC que detecta paradas não programadas em rotas ATIVAS
-- Regras: cluster de pings (não heartbeat) por >=5 min, deslocamento <=100m
-- Fora de qualquer parada (raio_geofence_metros, default 500) e fora do CD (500m)
-- Dedup: não recria alerta se já existe um em <30 min a <150m
CREATE OR REPLACE FUNCTION public.detectar_paradas_nao_programadas()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cd_lat numeric := -22.8783;
  cd_lng numeric := -43.3367;
  cd_raio numeric := 500;
  dwell_min integer := 5;
  cluster_raio numeric := 100;
  janela_min integer := 45;
  dedup_min integer := 30;
  dedup_raio numeric := 150;
  criados integer := 0;
  r record;
  cluster_row record;
BEGIN
  FOR r IN
    SELECT id, placa
    FROM public.monitoramento_rotas
    WHERE status = 'ativa'
      AND ultima_atualizacao > now() - (janela_min || ' minutes')::interval
  LOOP
    -- Encontra o cluster mais recente que satisfaz dwell e está fora dos raios
    FOR cluster_row IN
      WITH pings AS (
        SELECT id, latitude::float8 AS lat, longitude::float8 AS lng,
               registrado_em, COALESCE(accuracy,0) AS acc
          FROM public.posicoes_gps
         WHERE monitoramento_rota_id = r.id
           AND heartbeat = false
           AND registrado_em > now() - (janela_min || ' minutes')::interval
         ORDER BY registrado_em
      ),
      -- Marca ping como "âncora" (início de cluster) se distancia do anterior > cluster_raio
      marcados AS (
        SELECT p.*,
          CASE WHEN LAG(lat) OVER (ORDER BY registrado_em) IS NULL
                 OR 6371000 * 2 * asin(sqrt(
                      power(sin(radians((lat - LAG(lat) OVER (ORDER BY registrado_em))/2)),2)
                      + cos(radians(LAG(lat) OVER (ORDER BY registrado_em))) * cos(radians(lat))
                      * power(sin(radians((lng - LAG(lng) OVER (ORDER BY registrado_em))/2)),2)
                    )) > cluster_raio
               THEN 1 ELSE 0 END AS nova_ancora
        FROM pings p
      ),
      grp AS (
        SELECT *, SUM(nova_ancora) OVER (ORDER BY registrado_em) AS cluster_id
          FROM marcados
      ),
      clusters AS (
        SELECT cluster_id,
               MIN(registrado_em) AS inicio,
               MAX(registrado_em) AS fim,
               AVG(lat) AS lat,
               AVG(lng) AS lng,
               COUNT(*) AS n,
               AVG(acc) AS acc_media
          FROM grp
         GROUP BY cluster_id
      )
      SELECT *
        FROM clusters c
       WHERE EXTRACT(EPOCH FROM (c.fim - c.inicio)) / 60 >= dwell_min
         AND c.acc_media <= 60
         -- fora do CD
         AND 6371000 * 2 * asin(sqrt(
               power(sin(radians((c.lat - cd_lat)/2)),2)
               + cos(radians(cd_lat)) * cos(radians(c.lat))
               * power(sin(radians((c.lng - cd_lng)/2)),2)
             )) > cd_raio
         -- fora de todas as paradas da rota
         AND NOT EXISTS (
           SELECT 1 FROM public.monitoramento_paradas mp
            WHERE mp.monitoramento_rota_id = r.id
              AND mp.latitude IS NOT NULL AND mp.longitude IS NOT NULL
              AND 6371000 * 2 * asin(sqrt(
                    power(sin(radians((c.lat - mp.latitude::float8)/2)),2)
                    + cos(radians(mp.latitude::float8)) * cos(radians(c.lat))
                    * power(sin(radians((c.lng - mp.longitude::float8)/2)),2)
                  )) <= COALESCE(mp.raio_geofence_metros, 500)
         )
       ORDER BY c.fim DESC
       LIMIT 1
    LOOP
      -- Dedup: já existe alerta parecido nos últimos 30 min?
      IF NOT EXISTS (
        SELECT 1 FROM public.alertas_monitoramento a
         WHERE a.monitoramento_rota_id = r.id
           AND a.tipo = 'parada_nao_programada'
           AND a.created_at > now() - (dedup_min || ' minutes')::interval
           AND a.latitude IS NOT NULL AND a.longitude IS NOT NULL
           AND 6371000 * 2 * asin(sqrt(
                 power(sin(radians((cluster_row.lat - a.latitude::float8)/2)),2)
                 + cos(radians(a.latitude::float8)) * cos(radians(cluster_row.lat))
                 * power(sin(radians((cluster_row.lng - a.longitude::float8)/2)),2)
               )) <= dedup_raio
      ) THEN
        INSERT INTO public.alertas_monitoramento
          (monitoramento_rota_id, tipo, mensagem, latitude, longitude, metadata)
        VALUES (
          r.id,
          'parada_nao_programada',
          format('Veículo %s parado há %s min fora de rota programada',
                 r.placa,
                 ROUND(EXTRACT(EPOCH FROM (cluster_row.fim - cluster_row.inicio))/60)::text),
          cluster_row.lat,
          cluster_row.lng,
          jsonb_build_object(
            'inicio', cluster_row.inicio,
            'fim', cluster_row.fim,
            'num_pings', cluster_row.n,
            'accuracy_media', cluster_row.acc_media
          )
        );
        criados := criados + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('alertas_criados', criados, 'executado_em', now());
END;
$$;

GRANT EXECUTE ON FUNCTION public.detectar_paradas_nao_programadas() TO authenticated, service_role;
