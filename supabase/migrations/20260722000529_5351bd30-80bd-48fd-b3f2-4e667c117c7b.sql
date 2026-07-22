
-- ============ RPC: gerar sugestões ============
CREATE OR REPLACE FUNCTION public.gerar_sugestoes_dwell_factual()
RETURNS TABLE(destinatario_id uuid, sugestao_id uuid, num_pings int, num_rotas int, raio_m numeric, distancia_m numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r RECORD;
  v_lat numeric; v_lng numeric; v_radius numeric; v_dist numeric;
  v_first timestamptz; v_last timestamptz;
  v_pings int; v_rotas int;
  v_current_lat numeric; v_current_lng numeric;
  v_current_origem origem_coordenada; v_current_conf smallint;
  v_endereco_id uuid; v_sug_id uuid;
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
    WITH parada_pings AS (
      SELECT p.latitude, p.longitude, p.registrado_em, mp.monitoramento_rota_id
      FROM public.monitoramento_paradas mp
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
           count(*)::int, count(DISTINCT monitoramento_rota_id)::int
      INTO v_lat, v_lng, v_first, v_last, v_pings, v_rotas
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

    DELETE FROM public.sugestoes_coordenada
     WHERE sugestoes_coordenada.destinatario_id = r.dest_id
       AND status = 'pendente';

    INSERT INTO public.sugestoes_coordenada(
      destinatario_id, endereco_id, cluster_lat, cluster_lng,
      num_pings, num_rotas_distintas, primeira_visita, ultima_visita,
      raio_cluster_metros, distancia_atual_metros, origem_atual, confianca_atual, status
    ) VALUES (
      r.dest_id, v_endereco_id, v_lat, v_lng,
      v_pings, v_rotas, v_first, v_last,
      v_radius, v_dist, v_current_origem, v_current_conf, 'pendente'
    ) RETURNING id INTO v_sug_id;

    destinatario_id := r.dest_id; sugestao_id := v_sug_id;
    num_pings := v_pings; num_rotas := v_rotas;
    raio_m := v_radius; distancia_m := v_dist;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.gerar_sugestoes_dwell_factual() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.gerar_sugestoes_dwell_factual() TO authenticated, service_role;

-- ============ RPC: aprovar ============
CREATE OR REPLACE FUNCTION public.aprovar_sugestao_coordenada(p_sugestao_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  s RECORD;
  v_can boolean;
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;

  SELECT * INTO s FROM public.sugestoes_coordenada WHERE id = p_sugestao_id;
  IF NOT FOUND OR s.status <> 'pendente' THEN
    RAISE EXCEPTION 'sugestão não encontrada ou já decidida';
  END IF;

  v_can := public.pode_sobrescrever_coordenada('dwell_factual_aprovado'::origem_coordenada, s.origem_atual);

  IF v_can AND s.endereco_id IS NOT NULL THEN
    UPDATE public.destinatario_enderecos
       SET latitude = s.cluster_lat,
           longitude = s.cluster_lng,
           origem_coordenada = 'dwell_factual_aprovado',
           confianca_coordenada = 95,
           coordenada_atualizada_em = now(),
           coordenada_atualizada_por = COALESCE(auth.uid()::text,'system'),
           updated_at = now()
     WHERE id = s.endereco_id;
  END IF;

  UPDATE public.sugestoes_coordenada
     SET status = 'aprovada',
         decidido_por = auth.uid(),
         decidido_em = now()
   WHERE id = p_sugestao_id;

  RETURN jsonb_build_object('ok', true, 'coordenada_atualizada', v_can);
END $$;

REVOKE ALL ON FUNCTION public.aprovar_sugestao_coordenada(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.aprovar_sugestao_coordenada(uuid) TO authenticated, service_role;

-- ============ RPC: rejeitar ============
CREATE OR REPLACE FUNCTION public.rejeitar_sugestao_coordenada(p_sugestao_id uuid, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'sem permissão';
  END IF;
  UPDATE public.sugestoes_coordenada
     SET status = 'rejeitada',
         motivo_rejeicao = p_motivo,
         decidido_por = auth.uid(),
         decidido_em = now()
   WHERE id = p_sugestao_id AND status = 'pendente';
END $$;

REVOKE ALL ON FUNCTION public.rejeitar_sugestao_coordenada(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rejeitar_sugestao_coordenada(uuid, text) TO authenticated, service_role;
