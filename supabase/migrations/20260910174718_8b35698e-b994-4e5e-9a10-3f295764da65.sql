CREATE TABLE public.config_tracking_pandurata (
  id boolean PRIMARY KEY DEFAULT true,
  ativo boolean NOT NULL DEFAULT false,
  data_inicial date NOT NULL DEFAULT '2026-09-01',
  limite_por_rodada integer NOT NULL DEFAULT 40,
  max_tentativas integer NOT NULL DEFAULT 3,
  pausado_motivo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT config_tracking_pandurata_singleton CHECK (id)
);

GRANT SELECT ON public.config_tracking_pandurata TO authenticated;
GRANT ALL ON public.config_tracking_pandurata TO service_role;
ALTER TABLE public.config_tracking_pandurata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operadores leem config tracking pandurata"
  ON public.config_tracking_pandurata FOR SELECT TO authenticated
  USING (public.is_active_operator());

CREATE TABLE public.fila_tracking_pandurata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_nf text NOT NULL UNIQUE,
  invoice_detail_id bigint,
  trip_id bigint,
  status_enviado text,
  status_portal text,
  tentativas integer NOT NULL DEFAULT 0,
  ultimo_erro text,
  ultima_tentativa_em timestamptz,
  concluido_em timestamptz,
  motivo_conclusao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.fila_tracking_pandurata TO authenticated;
GRANT ALL ON public.fila_tracking_pandurata TO service_role;
ALTER TABLE public.fila_tracking_pandurata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operadores leem fila tracking pandurata"
  ON public.fila_tracking_pandurata FOR SELECT TO authenticated
  USING (public.is_active_operator());

CREATE INDEX idx_fila_tracking_pandurata_pendentes
  ON public.fila_tracking_pandurata (concluido_em, tentativas);

CREATE TABLE public.execucoes_tracking_pandurata (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  finalizado_em timestamptz,
  em_execucao boolean NOT NULL DEFAULT true,
  lease_expira_em timestamptz NOT NULL DEFAULT now() + interval '15 minutes',
  modo text NOT NULL DEFAULT 'simulacao',
  processadas integer NOT NULL DEFAULT 0,
  concluidas integer NOT NULL DEFAULT 0,
  recusadas integer NOT NULL DEFAULT 0,
  erro text,
  detalhe jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.execucoes_tracking_pandurata TO authenticated;
GRANT ALL ON public.execucoes_tracking_pandurata TO service_role;
ALTER TABLE public.execucoes_tracking_pandurata ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operadores leem execucoes tracking pandurata"
  ON public.execucoes_tracking_pandurata FOR SELECT TO authenticated
  USING (public.is_active_operator());

CREATE TRIGGER trg_config_tracking_pandurata_updated
  BEFORE UPDATE ON public.config_tracking_pandurata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_fila_tracking_pandurata_updated
  BEFORE UPDATE ON public.fila_tracking_pandurata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER trg_execucoes_tracking_pandurata_updated
  BEFORE UPDATE ON public.execucoes_tracking_pandurata
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.config_tracking_pandurata (id) VALUES (true);

-- Trava de execução única: só permite iniciar se não houver rodada ativa com lease válido.
CREATE OR REPLACE FUNCTION public.tracking_pandurata_iniciar_rodada(p_modo text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_id uuid;
BEGIN
  UPDATE public.execucoes_tracking_pandurata
     SET em_execucao = false, finalizado_em = COALESCE(finalizado_em, now()),
         erro = COALESCE(erro, 'lease_expirado')
   WHERE em_execucao AND lease_expira_em < now();

  IF EXISTS (SELECT 1 FROM public.execucoes_tracking_pandurata WHERE em_execucao) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.execucoes_tracking_pandurata (modo)
  VALUES (COALESCE(p_modo, 'simulacao'))
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.tracking_pandurata_iniciar_rodada(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_pandurata_iniciar_rodada(text) TO service_role;

-- Dias úteis: usa a função existente add_dias_uteis para validar se hoje é dia útil no RJ.
CREATE OR REPLACE FUNCTION public.tracking_pandurata_e_dia_util(p_data date)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.add_dias_uteis(p_data, 0) = p_data;
$$;

REVOKE ALL ON FUNCTION public.tracking_pandurata_e_dia_util(date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tracking_pandurata_e_dia_util(date) TO service_role;