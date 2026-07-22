
-- ============ FRENTE A: atualiza função de confiança ============
CREATE OR REPLACE FUNCTION public.confianca_origem(origem origem_coordenada)
RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE origem
    WHEN 'manual' THEN 100
    WHEN 'dwell_factual_aprovado' THEN 95
    WHEN 'google_geocode_rooftop' THEN 90
    WHEN 'google_geocode' THEN 80
    WHEN 'google_geocode_range' THEN 70
    WHEN 'google_places_nome' THEN 65
    WHEN 'dwell_factual_sugerido' THEN 60
    WHEN 'brasilapi_cep' THEN 40
    WHEN 'nominatim' THEN 35
    WHEN 'legado_desconhecido' THEN 30
    WHEN 'baixa_motorista' THEN 10
    WHEN 'amostra_insuficiente' THEN 0
    ELSE 0
  END;
$$;

-- ============ FRENTE A: fila de revisão ============
CREATE TABLE IF NOT EXISTS public.sugestoes_coordenada (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  destinatario_id uuid NOT NULL REFERENCES public.destinatarios(id) ON DELETE CASCADE,
  endereco_id uuid REFERENCES public.destinatario_enderecos(id) ON DELETE SET NULL,
  cluster_lat numeric NOT NULL,
  cluster_lng numeric NOT NULL,
  num_pings integer NOT NULL,
  num_rotas_distintas integer NOT NULL,
  primeira_visita timestamptz NOT NULL,
  ultima_visita timestamptz NOT NULL,
  raio_cluster_metros numeric NOT NULL,
  distancia_atual_metros numeric,
  origem_atual origem_coordenada,
  confianca_atual smallint,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','aprovada','rejeitada')),
  decidido_por uuid,
  decidido_em timestamptz,
  motivo_rejeicao text,
  observacao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sug_coord_status ON public.sugestoes_coordenada(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sug_coord_dest ON public.sugestoes_coordenada(destinatario_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_sug_coord_pendente_dest ON public.sugestoes_coordenada(destinatario_id) WHERE status = 'pendente';

GRANT SELECT, INSERT, UPDATE, DELETE ON public.sugestoes_coordenada TO authenticated;
GRANT ALL ON public.sugestoes_coordenada TO service_role;

ALTER TABLE public.sugestoes_coordenada ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sug_coord_read" ON public.sugestoes_coordenada
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_active_operator());

CREATE POLICY "sug_coord_insert" ON public.sugestoes_coordenada
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_active_operator());

CREATE POLICY "sug_coord_update" ON public.sugestoes_coordenada
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_active_operator())
  WITH CHECK (public.is_admin() OR public.is_active_operator());

CREATE POLICY "sug_coord_delete_admin" ON public.sugestoes_coordenada
  FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE TRIGGER trg_sug_coord_updated_at
  BEFORE UPDATE ON public.sugestoes_coordenada
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ HEARTBEAT: sinais de vida do APK ============
CREATE TABLE IF NOT EXISTS public.apk_heartbeats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  motorista_user_id uuid,
  app_version text,
  permissao_localizacao text CHECK (permissao_localizacao IN ('foreground','background','negada','desconhecida')),
  otimizacao_bateria text CHECK (otimizacao_bateria IN ('ativa','isenta','desconhecida')),
  bateria_pct smallint CHECK (bateria_pct IS NULL OR (bateria_pct >= 0 AND bateria_pct <= 100)),
  ultimo_gps_em timestamptz,
  recebido_em timestamptz NOT NULL DEFAULT now(),
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_apk_hb_placa_recente ON public.apk_heartbeats(placa, recebido_em DESC);
CREATE INDEX IF NOT EXISTS idx_apk_hb_recebido ON public.apk_heartbeats(recebido_em DESC);

GRANT SELECT ON public.apk_heartbeats TO authenticated;
GRANT INSERT, SELECT ON public.apk_heartbeats TO anon;
GRANT ALL ON public.apk_heartbeats TO service_role;

ALTER TABLE public.apk_heartbeats ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apk_hb_read_ops" ON public.apk_heartbeats
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_active_operator());

CREATE POLICY "apk_hb_insert_public" ON public.apk_heartbeats
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- view: último heartbeat por placa
CREATE OR REPLACE VIEW public.vw_apk_heartbeat_atual AS
SELECT DISTINCT ON (placa)
  placa,
  recebido_em,
  motorista_user_id,
  app_version,
  permissao_localizacao,
  otimizacao_bateria,
  bateria_pct,
  ultimo_gps_em,
  EXTRACT(EPOCH FROM (now() - recebido_em))::int AS segundos_desde_ultimo,
  CASE
    WHEN now() - recebido_em <= interval '3 minutes' THEN 'vivo'
    WHEN now() - recebido_em <= interval '10 minutes' THEN 'instavel'
    ELSE 'morto'
  END AS estado
FROM public.apk_heartbeats
ORDER BY placa, recebido_em DESC;

GRANT SELECT ON public.vw_apk_heartbeat_atual TO authenticated;
