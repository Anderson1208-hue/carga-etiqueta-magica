
-- Configuration table (singleton)
CREATE TABLE public.monitoramento_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raio_padrao_metros integer NOT NULL DEFAULT 100,
  tempo_minimo_atendimento_min integer NOT NULL DEFAULT 5,
  tempo_maximo_cliente_min integer NOT NULL DEFAULT 60,
  tolerancia_gps_metros integer NOT NULL DEFAULT 30,
  tempo_max_sem_atualizacao_min integer NOT NULL DEFAULT 15,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

-- Route monitoring sessions
CREATE TABLE public.monitoramento_rotas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  motorista text,
  placa text NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'ativa',
  ultima_lat numeric,
  ultima_lng numeric,
  ultima_atualizacao timestamptz,
  total_paradas integer NOT NULL DEFAULT 0,
  paradas_concluidas integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

-- Stop tracking
CREATE TABLE public.monitoramento_paradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoramento_rota_id uuid NOT NULL REFERENCES public.monitoramento_rotas(id) ON DELETE CASCADE,
  ordem integer NOT NULL,
  cnpj_destinatario text,
  razao_social text,
  endereco_completo text,
  latitude numeric,
  longitude numeric,
  raio_geofence_metros integer NOT NULL DEFAULT 100,
  horario_previsto timestamptz,
  horario_chegada timestamptz,
  horario_saida timestamptz,
  tempo_permanencia_min integer,
  status text NOT NULL DEFAULT 'programada',
  is_excecao boolean NOT NULL DEFAULT false,
  justificativa text,
  justificativa_tipo text,
  justificativa_por uuid,
  justificativa_em timestamptz,
  total_nfs integer DEFAULT 0,
  total_caixas integer DEFAULT 0,
  peso_total_kg numeric DEFAULT 0,
  volume_total_m3 numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- GPS position log
CREATE TABLE public.posicoes_gps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoramento_rota_id uuid NOT NULL REFERENCES public.monitoramento_rotas(id) ON DELETE CASCADE,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  accuracy numeric,
  registrado_em timestamptz NOT NULL DEFAULT now()
);

-- Alerts
CREATE TABLE public.alertas_monitoramento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitoramento_rota_id uuid NOT NULL REFERENCES public.monitoramento_rotas(id) ON DELETE CASCADE,
  monitoramento_parada_id uuid REFERENCES public.monitoramento_paradas(id) ON DELETE SET NULL,
  tipo text NOT NULL,
  mensagem text NOT NULL,
  lido boolean NOT NULL DEFAULT false,
  lido_por uuid,
  lido_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE public.monitoramento_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoramento_rotas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoramento_paradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posicoes_gps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_monitoramento ENABLE ROW LEVEL SECURITY;

-- Config policies
CREATE POLICY "Admins can manage config" ON public.monitoramento_config FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "Operators can view config" ON public.monitoramento_config FOR SELECT TO authenticated USING (is_active_operator());

-- Route monitoring policies
CREATE POLICY "Users can view monitoramento_rotas" ON public.monitoramento_rotas FOR SELECT TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Users can create monitoramento_rotas" ON public.monitoramento_rotas FOR INSERT TO authenticated WITH CHECK (has_profile());
CREATE POLICY "Users can update monitoramento_rotas" ON public.monitoramento_rotas FOR UPDATE TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Admins can delete monitoramento_rotas" ON public.monitoramento_rotas FOR DELETE TO authenticated USING (is_admin());

-- Stop policies
CREATE POLICY "Users can view mon_paradas" ON public.monitoramento_paradas FOR SELECT TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Users can create mon_paradas" ON public.monitoramento_paradas FOR INSERT TO authenticated WITH CHECK (has_profile());
CREATE POLICY "Users can update mon_paradas" ON public.monitoramento_paradas FOR UPDATE TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Admins can delete mon_paradas" ON public.monitoramento_paradas FOR DELETE TO authenticated USING (is_admin());

-- GPS positions policies (allow public insert for mobile driver without auth)
CREATE POLICY "Users can view positions" ON public.posicoes_gps FOR SELECT TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Anyone can insert positions" ON public.posicoes_gps FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Admins can delete positions" ON public.posicoes_gps FOR DELETE TO authenticated USING (is_admin());

-- Alert policies
CREATE POLICY "Users can view alerts" ON public.alertas_monitoramento FOR SELECT TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Users can create alerts" ON public.alertas_monitoramento FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Users can update alerts" ON public.alertas_monitoramento FOR UPDATE TO authenticated USING (is_admin() OR is_active_operator());
CREATE POLICY "Admins can delete alerts" ON public.alertas_monitoramento FOR DELETE TO authenticated USING (is_admin());

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.monitoramento_paradas;
ALTER PUBLICATION supabase_realtime ADD TABLE public.alertas_monitoramento;
ALTER PUBLICATION supabase_realtime ADD TABLE public.monitoramento_rotas;

-- Validation trigger for monitoramento_paradas status
CREATE OR REPLACE FUNCTION public.validate_monitoramento_parada_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('programada','em_rota','chegou_cliente','em_atendimento','finalizada','pulada','parada_excessiva','fora_sequencia','visita_inconsistente') THEN
    RAISE EXCEPTION 'status de parada inválido: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_mon_parada_status
BEFORE INSERT OR UPDATE ON public.monitoramento_paradas
FOR EACH ROW EXECUTE FUNCTION public.validate_monitoramento_parada_status();

-- Validation trigger for monitoramento_rotas status
CREATE OR REPLACE FUNCTION public.validate_monitoramento_rota_status()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status NOT IN ('ativa','finalizada','pausada') THEN
    RAISE EXCEPTION 'status de rota inválido: %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validate_mon_rota_status
BEFORE INSERT OR UPDATE ON public.monitoramento_rotas
FOR EACH ROW EXECUTE FUNCTION public.validate_monitoramento_rota_status();

-- Insert default config
INSERT INTO public.monitoramento_config (id) VALUES (gen_random_uuid());
