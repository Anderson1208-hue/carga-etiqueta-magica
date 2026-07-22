
CREATE OR REPLACE FUNCTION public.gerar_sugestoes_dwell_factual()
RETURNS TABLE(
  geradas int,
  ambiguas int,
  descartadas_accuracy int,
  descartadas_recorrencia int,
  descartadas_dwell int,
  descartadas_consistencia int,
  descartadas_confianca int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r RECORD;
  rota RECORD;
  v_lat numeric; v_lng numeric; v_radius numeric; v_dist numeric;
  v_first timestamptz; v_last timestamptz;
  v_pings int; v_rotas int; v_placas int;
  v_current_lat numeric; v_current_lng numeric;
  v_current_origem origem_coordenada; v_current_conf smallint;
  v_endereco_id uuid; v_sug_id uuid;
  v_vizinhos jsonb;
  v_max_pairwise numeric;
  v_ambigua boolean; v_motivo_amb text;
  v_geradas int := 0; v_ambiguas int := 0;
  v_desc_acc int := 0; v_desc_rec int := 0;
  v_desc_dwell int := 0; v_desc_cons int := 0; v_desc_conf int := 0;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS _tmp_route_centroids (
    rota_id uuid, veiculo_id uuid, lat numeric, lng numeric,
    first_ts timestamptz, last_ts timestamptz, n_pings int, vel_media numeric
  ) ON COMMIT DROP;

  FOR r IN
    SELECT d.id AS dest_id, d.cnpj_cpf
    FROM public.destinatarios d
    WHERE EXISTS (
      SELECT 1 FROM public.monitoramento_paradas mp
      WHERE regexp_replace(mp.cnpj_destinatario,'\D','','g') = regexp_replace(d.cnpj_cpf,'\D','','g')
        AND mp.status IN ('finalizada','em_atendimento')
        AND mp.horario_chegada >= now() - interval '30 days'
      GROUP BY 1
      HAVING count(DISTINCT mp.monitoramento_rota_id) >= 2
    )
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.sugestoes_coordenada
       WHERE sugestoes_coordenada.destinatario_id = r.dest_id
         AND status = 'rejeitada'
         AND decidido_em >= now() - interval '60 days'
    ) THEN
      v_desc_rec := v_desc_rec + 1;
      CONTINUE;
    END IF;

    DELETE FROM _tmp_route_centroids;

    FOR rota IN
      SELECT mp.id AS parada_id, mp.monitoramento_rota_id, mr.veiculo_id,
             mp.horario_chegada, mp.horario_saida
      FROM public.monitoramento_paradas mp
      JOIN public.monitoramento_rotas mr ON mr.id = mp.monitoramento_rota_id
      WHERE regexp_replace(mp.cnpj_destinatario,'\D','','g') = regexp_replace(r.cnpj_cpf,'\D','','g')
        AND mp.status IN ('finalizada','em_atendimento')
        AND mp.horario_chegada >= now() - interval '30 days'
        AND mp.horario_saida IS NOT NULL
        AND mp.horario_saida > mp.horario_chegada
        AND EXTRACT(EPOCH FROM (mp.horario_saida - mp.horario_chegada))/60 BETWEEN 5 AND 120
    LOOP
      -- Accuracy 30m
      WITH pings AS (
        SELECT p.latitude, p.longitude, p.registrado_em,
               lag(p.latitude) OVER w AS plat,
               lag(p.longitude) OVER w AS plng,
               lag(p.registrado_em) OVER w AS pts
        FROM public.posicoes_gps p
        WHERE p.monitoramento_rota_id = rota.monitoramento_rota_id
          AND p.registrado_em >= rota.horario_chegada
          AND p.registrado_em <= rota.horario_saida
          AND COALESCE(p.accuracy, 999) <= 30
        WINDOW w AS (ORDER BY p.registrado_em)
      ), vel AS (
        SELECT *,
          CASE WHEN plat IS NULL OR pts IS NULL OR registrado_em = pts THEN NULL
               ELSE (2*6371*asin(sqrt(
                      power(sin(radians((latitude-plat)/2)),2) +
                      cos(radians(plat))*cos(radians(latitude))*
                      power(sin(radians((longitude-plng)/2)),2)
                    ))) / (EXTRACT(EPOCH FROM (registrado_em - pts))/3600.0)
          END AS kmh
        FROM pings
      )
      INSERT INTO _tmp_route_centroids
      SELECT rota.monitoramento_rota_id, rota.veiculo_id,
             avg(latitude), avg(longitude),
             min(registrado_em), max(registrado_em),
             count(*)::int, COALESCE(avg(kmh), 0)
      FROM vel
      HAVING count(*) >= 5 AND COALESCE(avg(kmh), 0) <= 3;

      IF NOT FOUND THEN
        WITH pings AS (
          SELECT p.latitude, p.longitude, p.registrado_em,
                 lag(p.latitude) OVER w AS plat,
                 lag(p.longitude) OVER w AS plng,
                 lag(p.registrado_em) OVER w AS pts
          FROM public.posicoes_gps p
          WHERE p.monitoramento_rota_id = rota.monitoramento_rota_id
            AND p.registrado_em >= rota.horario_chegada
            AND p.registrado_em <= rota.horario_saida
            AND COALESCE(p.accuracy, 999) <= 50
          WINDOW w AS (ORDER BY p.registrado_em)
        ), vel AS (
          SELECT *,
            CASE WHEN plat IS NULL OR pts IS NULL OR registrado_em = pts THEN NULL
                 ELSE (2*6371*asin(sqrt(
                        power(sin(radians((latitude-plat)/2)),2) +
                        cos(radians(plat))*cos(radians(latitude))*
                        power(sin(radians((longitude-plng)/2)),2)
                      ))) / (EXTRACT(EPOCH FROM (registrado_em - pts))/3600.0)
            END AS kmh
          FROM pings
        )
        INSERT INTO _tmp_route_centroids
        SELECT rota.monitoramento_rota_id, rota.veiculo_id,
               avg(latitude), avg(longitude),
               min(registrado_em), max(registrado_em),
               count(*)::int, COALESCE(avg(kmh), 0)
        FROM vel
        HAVING count(*) >= 5 AND COALESCE(avg(kmh), 0) <= 3;
      END IF;
    END LOOP;

    SELECT count(*) INTO v_rotas FROM _tmp_route_centroids;
    IF v_rotas < 2 THEN
      IF EXISTS (
        SELECT 1 FROM public.monitoramento_paradas mp
         WHERE regexp_replace(mp.cnpj_destinatario,'\D','','g') = regexp_replace(r.cnpj_cpf,'\D','','g')
           AND mp.status IN ('finalizada','em_atendimento')
           AND mp.horario_chegada >= now() - interval '30 days'
      ) THEN
        v_desc_acc := v_desc_acc + 1;
      ELSE
        v_desc_dwell := v_desc_dwell + 1;
      END IF;
      CONTINUE;
    END IF;

    SELECT max(2*6371000*asin(sqrt(
             power(sin(radians((a.lat - b.lat)/2)),2) +
             cos(radians(a.lat))*cos(radians(b.lat))*
             power(sin(radians((a.lng - b.lng)/2)),2)
           )))
      INTO v_max_pairwise
      FROM _tmp_route_centroids a
      JOIN _tmp_route_centroids b ON a.rota_id < b.rota_id;

    IF v_max_pairwise IS NULL OR v_max_pairwise > 100 THEN
      v_desc_cons := v_desc_cons + 1;
      CONTINUE;
    END IF;

    SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY lat),
           percentile_cont(0.5) WITHIN GROUP (ORDER BY lng),
           sum(n_pings)::int, count(DISTINCT veiculo_id)::int, min(first_ts), max(last_ts)
      INTO v_lat, v_lng, v_pings, v_placas, v_first, v_last
      FROM _tmp_route_centroids;

    SELECT percentile_cont(0.9) WITHIN GROUP (ORDER BY
      2*6371000*asin(sqrt(
        power(sin(radians((p.latitude - v_lat)/2)),2) +
        cos(radians(v_lat))*cos(radians(p.latitude))*
        power(sin(radians((p.longitude - v_lng)/2)),2)
      )))
      INTO v_radius
      FROM public.monitoramento_paradas mp
      JOIN public.posicoes_gps p
        ON p.monitoramento_rota_id = mp.monitoramento_rota_id
       AND p.registrado_em >= mp.horario_chegada
       AND p.registrado_em <= COALESCE(mp.horario_saida, mp.horario_chegada + interval '2 hours')
       AND COALESCE(p.accuracy, 999) <= 50
     WHERE regexp_replace(mp.cnpj_destinatario,'\D','','g') = regexp_replace(r.cnpj_cpf,'\D','','g')
       AND mp.status IN ('finalizada','em_atendimento')
       AND mp.horario_chegada >= now() - interval '30 days'
       AND mp.horario_saida IS NOT NULL
       AND EXTRACT(EPOCH FROM (mp.horario_saida - mp.horario_chegada))/60 BETWEEN 5 AND 120;

    SELECT de.id, de.latitude, de.longitude, de.origem_coordenada, de.confianca_coordenada
      INTO v_endereco_id, v_current_lat, v_current_lng, v_current_origem, v_current_conf
      FROM public.destinatario_enderecos de
     WHERE de.destinatario_id = r.dest_id
       AND de.principal = true AND de.ativo = true
     ORDER BY de.updated_at DESC LIMIT 1;

    v_dist := NULL;
    IF v_current_lat IS NOT NULL THEN
      v_dist := 2*6371000*asin(sqrt(
        power(sin(radians((v_lat - v_current_lat)/2)),2) +
        cos(radians(v_current_lat))*cos(radians(v_lat))*
        power(sin(radians((v_lng - v_current_lng)/2)),2)
      ));
      IF v_dist < 150 OR v_dist > 50000 THEN
        v_desc_cons := v_desc_cons + 1;
        CONTINUE;
      END IF;
      IF COALESCE(v_current_conf, 0) >= 90 THEN
        v_desc_conf := v_desc_conf + 1;
        CONTINUE;
      END IF;
    END IF;

    v_ambigua := false;
    v_motivo_amb := NULL;
    SELECT true, format('%s parada(s) da mesma rota a <200m do cluster', count(*))
      INTO v_ambigua, v_motivo_amb
      FROM public.monitoramento_paradas mp2
     WHERE mp2.monitoramento_rota_id IN (SELECT rota_id FROM _tmp_route_centroids)
       AND mp2.cnpj_destinatario IS NOT NULL
       AND regexp_replace(mp2.cnpj_destinatario,'\D','','g') <> regexp_replace(r.cnpj_cpf,'\D','','g')
       AND mp2.latitude IS NOT NULL
       AND 2*6371000*asin(sqrt(
             power(sin(radians((mp2.latitude - v_lat)/2)),2) +
             cos(radians(v_lat))*cos(radians(mp2.latitude))*
             power(sin(radians((mp2.longitude - v_lng)/2)),2)
           )) < 200
     HAVING count(*) > 0;

    IF v_ambigua IS NULL THEN v_ambigua := false; END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'destinatario_id', d.id,
      'nome', COALESCE(d.nome_fantasia, d.razao_social),
      'cnpj', d.cnpj_cpf,
      'distancia_m', round(dist_m)::int
    ) ORDER BY dist_m), '[]'::jsonb)
      INTO v_vizinhos
      FROM (
        SELECT de.destinatario_id,
               2*6371000*asin(sqrt(
                 power(sin(radians((de.latitude - v_lat)/2)),2) +
                 cos(radians(v_lat))*cos(radians(de.latitude))*
                 power(sin(radians((de.longitude - v_lng)/2)),2)
               )) AS dist_m
          FROM public.destinatario_enderecos de
         WHERE de.destinatario_id <> r.dest_id
           AND de.ativo = true
           AND de.principal = true
           AND de.latitude IS NOT NULL
           AND de.latitude BETWEEN v_lat - 0.003 AND v_lat + 0.003
           AND de.longitude BETWEEN v_lng - 0.003 AND v_lng + 0.003
      ) x
      JOIN public.destinatarios d ON d.id = x.destinatario_id
     WHERE dist_m < 200;

    DELETE FROM public.sugestoes_coordenada
     WHERE sugestoes_coordenada.destinatario_id = r.dest_id
       AND status = 'pendente';

    INSERT INTO public.sugestoes_coordenada(
      destinatario_id, endereco_id, cluster_lat, cluster_lng,
      num_pings, num_rotas_distintas, num_placas_distintas,
      primeira_visita, ultima_visita,
      raio_cluster_metros, distancia_atual_metros,
      origem_atual, confianca_atual, clientes_vizinhos_200m,
      ambigua, motivo_ambiguidade, status
    ) VALUES (
      r.dest_id, v_endereco_id, v_lat, v_lng,
      v_pings, v_rotas, v_placas,
      v_first, v_last,
      v_radius, v_dist,
      v_current_origem, v_current_conf, COALESCE(v_vizinhos,'[]'::jsonb),
      v_ambigua, v_motivo_amb, 'pendente'
    ) RETURNING id INTO v_sug_id;

    v_geradas := v_geradas + 1;
    IF v_ambigua THEN v_ambiguas := v_ambiguas + 1; END IF;
  END LOOP;

  geradas := v_geradas;
  ambiguas := v_ambiguas;
  descartadas_accuracy := v_desc_acc;
  descartadas_recorrencia := v_desc_rec;
  descartadas_dwell := v_desc_dwell;
  descartadas_consistencia := v_desc_cons;
  descartadas_confianca := v_desc_conf;
  RETURN NEXT;
END $function$;
