
-- 1. Novas colunas de evidência
ALTER TABLE public.sugestoes_coordenada
  ADD COLUMN IF NOT EXISTS num_placas_distintas int,
  ADD COLUMN IF NOT EXISTS clientes_vizinhos_200m jsonb DEFAULT '[]'::jsonb;

-- 2. Rejeição EXIGE motivo
CREATE OR REPLACE FUNCTION public.rejeitar_sugestao_coordenada(p_sugestao_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  IF p_motivo IS NULL OR length(btrim(p_motivo)) < 3 THEN
    RAISE EXCEPTION 'motivo da rejeição é obrigatório (mínimo 3 caracteres)';
  END IF;
  UPDATE public.sugestoes_coordenada
     SET status = 'rejeitada',
         motivo_rejeicao = btrim(p_motivo),
         decidido_por = auth.uid(),
         decidido_em = now()
   WHERE id = p_sugestao_id AND status = 'pendente';
END $$;

-- 3. Regerar com placas, vizinhos e cooldown de 60 dias
CREATE OR REPLACE FUNCTION public.gerar_sugestoes_dwell_factual()
RETURNS TABLE(destinatario_id uuid, sugestao_id uuid, num_pings integer, num_rotas integer, raio_m numeric, distancia_m numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r RECORD;
  v_lat numeric; v_lng numeric; v_radius numeric; v_dist numeric;
  v_first timestamptz; v_last timestamptz;
  v_pings int; v_rotas int; v_placas int;
  v_current_lat numeric; v_current_lng numeric;
  v_current_origem origem_coordenada; v_current_conf smallint;
  v_endereco_id uuid; v_sug_id uuid;
  v_vizinhos jsonb;
BEGIN
  FOR r IN
    SELECT mp.destinatario_id AS dest_id
    FROM public.monitoramento_paradas mp
    WHERE mp.status IN ('finalizada','em_atendimento')
      AND mp.horario_chegada >= now() - interval '30 days'
      AND mp.destinatario_id IS NOT NULL
    GROUP BY mp.destinatario_id
    HAVING count(DISTINCT mp.monitoramento_rota_id) >= 2
  LOOP
    -- Cooldown: se foi rejeitado nos últimos 60 dias, pular
    IF EXISTS (
      SELECT 1 FROM public.sugestoes_coordenada
       WHERE sugestoes_coordenada.destinatario_id = r.dest_id
         AND status = 'rejeitada'
         AND decidido_em >= now() - interval '60 days'
    ) THEN CONTINUE; END IF;

    WITH parada_pings AS (
      SELECT p.latitude, p.longitude, p.registrado_em, mp.monitoramento_rota_id, mr.veiculo_id
      FROM public.monitoramento_paradas mp
      JOIN public.monitoramento_rotas mr ON mr.id = mp.monitoramento_rota_id
      JOIN public.posicoes_gps p
        ON p.monitoramento_rota_id = mp.monitoramento_rota_id
       AND p.registrado_em >= mp.horario_chegada
       AND p.registrado_em <= COALESCE(mp.horario_saida, mp.horario_chegada + interval '2 hours')
       AND COALESCE(p.accuracy, 999) <= 50
      WHERE mp.destinatario_id = r.dest_id
        AND mp.status IN ('finalizada','em_atendimento')
        AND mp.horario_chegada >= now() - interval '30 days'
    )
    SELECT avg(latitude), avg(longitude), min(registrado_em), max(registrado_em),
           count(*)::int, count(DISTINCT monitoramento_rota_id)::int, count(DISTINCT veiculo_id)::int
      INTO v_lat, v_lng, v_first, v_last, v_pings, v_rotas, v_placas
      FROM parada_pings;

    IF v_lat IS NULL OR v_pings < 20 OR v_rotas < 2 THEN CONTINUE; END IF;

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
     WHERE mp.destinatario_id = r.dest_id
       AND mp.status IN ('finalizada','em_atendimento')
       AND mp.horario_chegada >= now() - interval '30 days';

    IF v_radius IS NULL OR v_radius > 80 THEN CONTINUE; END IF;

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
      IF v_dist < 150 OR v_dist > 50000 THEN CONTINUE; END IF;
      IF COALESCE(v_current_conf, 0) >= 90 THEN CONTINUE; END IF;
    END IF;

    -- P4: outros clientes <200m do cluster proposto
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
      origem_atual, confianca_atual, clientes_vizinhos_200m, status
    ) VALUES (
      r.dest_id, v_endereco_id, v_lat, v_lng,
      v_pings, v_rotas, v_placas,
      v_first, v_last,
      v_radius, v_dist,
      v_current_origem, v_current_conf, COALESCE(v_vizinhos,'[]'::jsonb), 'pendente'
    ) RETURNING id INTO v_sug_id;

    destinatario_id := r.dest_id; sugestao_id := v_sug_id;
    num_pings := v_pings; num_rotas := v_rotas;
    raio_m := v_radius; distancia_m := v_dist;
    RETURN NEXT;
  END LOOP;
END $$;

-- 4. RPC: pings do cluster para o mapa (só admin/operador)
CREATE OR REPLACE FUNCTION public.pings_sugestao_coordenada(p_sugestao_id uuid)
RETURNS TABLE(lat numeric, lng numeric, registrado_em timestamptz, accuracy numeric)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE s RECORD;
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  SELECT * INTO s FROM public.sugestoes_coordenada WHERE id = p_sugestao_id;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
    SELECT p.latitude, p.longitude, p.registrado_em, p.accuracy
      FROM public.monitoramento_paradas mp
      JOIN public.posicoes_gps p
        ON p.monitoramento_rota_id = mp.monitoramento_rota_id
       AND p.registrado_em >= mp.horario_chegada
       AND p.registrado_em <= COALESCE(mp.horario_saida, mp.horario_chegada + interval '2 hours')
       AND COALESCE(p.accuracy, 999) <= 50
     WHERE mp.destinatario_id = s.destinatario_id
       AND mp.status IN ('finalizada','em_atendimento')
       AND mp.horario_chegada >= now() - interval '30 days'
     LIMIT 500;
END $$;
