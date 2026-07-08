CREATE OR REPLACE FUNCTION public.detectar_paradas_suspeitas(p_rota_id uuid)
 RETURNS TABLE(cluster_num integer, inicio timestamp with time zone, fim timestamp with time zone, duracao_min integer, latitude numeric, longitude numeric, pontos integer, parada_planejada_id uuid, parada_ordem integer, parada_razao_social text, distancia_parada_m integer, classificacao text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  min_dur_min constant int := 5;
  max_dist_m constant float8 := 50;
  max_gap_sec constant float8 := 180;
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  RETURN QUERY
  WITH pts AS (
    SELECT
      registrado_em,
      posicoes_gps.latitude::float8 AS lat,
      posicoes_gps.longitude::float8 AS lng,
      LAG(posicoes_gps.latitude::float8)  OVER w AS plat,
      LAG(posicoes_gps.longitude::float8) OVER w AS plng,
      LAG(registrado_em)     OVER w AS pt
    FROM public.posicoes_gps
    WHERE monitoramento_rota_id = p_rota_id
      AND heartbeat = false
      AND posicoes_gps.latitude IS NOT NULL AND posicoes_gps.longitude IS NOT NULL
    WINDOW w AS (ORDER BY registrado_em)
  ),
  gapped AS (
    SELECT p.*,
      CASE
        WHEN plat IS NULL THEN 1
        WHEN EXTRACT(EPOCH FROM (registrado_em - pt)) > max_gap_sec THEN 1
        WHEN (6371000.0 * 2 * asin(sqrt(
              power(sin(radians(lat - plat)/2), 2)
              + cos(radians(plat)) * cos(radians(lat))
                * power(sin(radians(lng - plng)/2), 2)
             ))) > max_dist_m THEN 1
        ELSE 0
      END AS new_cluster
    FROM pts p
  ),
  clustered AS (
    SELECT g.*, SUM(new_cluster) OVER (ORDER BY registrado_em) AS cid
    FROM gapped g
  ),
  agg AS (
    SELECT
      cid,
      MIN(registrado_em) AS inicio,
      MAX(registrado_em) AS fim,
      AVG(lat) AS clat,
      AVG(lng) AS clng,
      COUNT(*)::int AS npts
    FROM clustered
    GROUP BY cid
    HAVING EXTRACT(EPOCH FROM (MAX(registrado_em) - MIN(registrado_em)))/60 >= min_dur_min
  ),
  paradas_plan AS (
    SELECT id, ordem, razao_social,
           monitoramento_paradas.latitude::float8 AS lat, monitoramento_paradas.longitude::float8 AS lng,
           COALESCE(raio_geofence_metros, 100) AS raio
    FROM public.monitoramento_paradas
    WHERE monitoramento_rota_id = p_rota_id
      AND monitoramento_paradas.latitude IS NOT NULL AND monitoramento_paradas.longitude IS NOT NULL
  ),
  matched AS (
    SELECT
      a.*,
      p.id     AS pid,
      p.ordem  AS pordem,
      p.razao_social AS pnome,
      p.raio   AS praio,
      CASE WHEN p.id IS NULL THEN NULL::int
      ELSE (6371000.0 * 2 * asin(sqrt(
            power(sin(radians(p.lat - a.clat)/2), 2)
            + cos(radians(a.clat)) * cos(radians(p.lat))
              * power(sin(radians(p.lng - a.clng)/2), 2)
           )))::int END AS dist_m
    FROM agg a
    LEFT JOIN LATERAL (
      SELECT pp.*
      FROM paradas_plan pp
      ORDER BY 6371000.0 * 2 * asin(sqrt(
        power(sin(radians(pp.lat - a.clat)/2), 2)
        + cos(radians(a.clat)) * cos(radians(pp.lat))
          * power(sin(radians(pp.lng - a.clng)/2), 2)
      )) ASC
      LIMIT 1
    ) p ON true
  )
  SELECT
    ROW_NUMBER() OVER (ORDER BY m.inicio)::int AS cluster_num,
    m.inicio,
    m.fim,
    CEIL(EXTRACT(EPOCH FROM (m.fim - m.inicio))/60.0)::int AS duracao_min,
    m.clat::numeric AS latitude,
    m.clng::numeric AS longitude,
    m.npts AS pontos,
    m.pid AS parada_planejada_id,
    m.pordem AS parada_ordem,
    m.pnome AS parada_razao_social,
    m.dist_m AS distancia_parada_m,
    CASE
      WHEN m.dist_m IS NOT NULL AND m.dist_m <= GREATEST(m.praio, 100) THEN 'planejada'
      WHEN EXTRACT(HOUR FROM (m.inicio AT TIME ZONE 'America/Sao_Paulo')) BETWEEN 11 AND 13
        AND EXTRACT(EPOCH FROM (m.fim - m.inicio))/60 <= 90 THEN 'almoco'
      WHEN EXTRACT(EPOCH FROM (m.fim - m.inicio))/60 >= 15 THEN 'suspeita'
      ELSE 'atencao'
    END AS classificacao
  FROM matched m
  ORDER BY m.inicio;
END;
$function$;