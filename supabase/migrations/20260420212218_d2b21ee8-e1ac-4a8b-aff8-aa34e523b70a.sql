-- ============================================
-- AUDIT LOG SYSTEM (particionado por mês)
-- ============================================

-- 1. Tabela principal particionada
CREATE TABLE public.audit_log (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  action text NOT NULL, -- 'create' | 'update' | 'delete' | 'status_change'
  entity_type text NOT NULL, -- 'carga' | 'nf' | 'agendamento' | 'etiqueta' | 'baixa' | 'profile' | 'veiculo'
  entity_id uuid,
  changes jsonb,
  metadata jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Índices na tabela pai (herdados pelas partições)
CREATE INDEX idx_audit_log_user_id ON public.audit_log (user_id, created_at DESC);
CREATE INDEX idx_audit_log_entity ON public.audit_log (entity_type, entity_id, created_at DESC);
CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_action ON public.audit_log (action, created_at DESC);

-- 2. Criar partições para os próximos 6 meses
DO $$
DECLARE
  v_start date;
  v_end date;
  v_partition_name text;
  i int;
BEGIN
  FOR i IN 0..6 LOOP
    v_start := date_trunc('month', CURRENT_DATE + (i || ' month')::interval)::date;
    v_end := (v_start + interval '1 month')::date;
    v_partition_name := 'audit_log_' || to_char(v_start, 'YYYY_MM');
    
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
      v_partition_name, v_start, v_end
    );
  END LOOP;
END $$;

-- 3. Função para criar partições futuras automaticamente
CREATE OR REPLACE FUNCTION public.ensure_audit_log_partition()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_start date;
  v_end date;
  v_partition_name text;
  i int;
BEGIN
  FOR i IN 0..2 LOOP
    v_start := date_trunc('month', CURRENT_DATE + (i || ' month')::interval)::date;
    v_end := (v_start + interval '1 month')::date;
    v_partition_name := 'audit_log_' || to_char(v_start, 'YYYY_MM');
    
    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.audit_log FOR VALUES FROM (%L) TO (%L)',
      v_partition_name, v_start, v_end
    );
  END LOOP;
END;
$$;

-- 4. RLS — somente admin lê, ninguém edita/deleta, sistema insere
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
ON public.audit_log
FOR SELECT
TO authenticated
USING (is_admin());

CREATE POLICY "System can insert audit logs"
ON public.audit_log
FOR INSERT
TO authenticated
WITH CHECK (true);

-- 5. Função genérica de auditoria
CREATE OR REPLACE FUNCTION public.fn_audit_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_action text;
  v_entity_type text;
  v_entity_id uuid;
  v_changes jsonb;
  v_old jsonb;
  v_new jsonb;
  v_diff jsonb := '{}'::jsonb;
  v_key text;
BEGIN
  v_user_id := auth.uid();
  v_entity_type := TG_ARGV[0];

  -- Email snapshot
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_entity_id := (to_jsonb(NEW)->>'id')::uuid;
    v_changes := jsonb_build_object('after', to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_entity_id := (to_jsonb(NEW)->>'id')::uuid;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);

    -- Calcula diff (apenas campos alterados)
    FOR v_key IN SELECT jsonb_object_keys(v_new) LOOP
      IF v_old->v_key IS DISTINCT FROM v_new->v_key THEN
        v_diff := v_diff || jsonb_build_object(
          v_key,
          jsonb_build_object('before', v_old->v_key, 'after', v_new->v_key)
        );
      END IF;
    END LOOP;

    -- Se nada mudou, não loga
    IF v_diff = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    -- Detecta mudança de status
    IF v_diff ? 'status' OR v_diff ? 'status_entrega' OR v_diff ? 'role' OR v_diff ? 'ativo' THEN
      v_action := 'status_change';
    END IF;

    v_changes := v_diff;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_entity_id := (to_jsonb(OLD)->>'id')::uuid;
    v_changes := jsonb_build_object('before', to_jsonb(OLD));
  END IF;

  INSERT INTO public.audit_log (
    user_id, user_email, action, entity_type, entity_id, changes
  ) VALUES (
    v_user_id, v_user_email, v_action, v_entity_type, v_entity_id, v_changes
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- 6. Triggers nas entidades críticas

-- Cargas
CREATE TRIGGER trg_audit_cargas
AFTER INSERT OR UPDATE OR DELETE ON public.cargas
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('carga');

-- Notas Fiscais (apenas mudanças de status_entrega + delete, evita logar cada importação)
CREATE OR REPLACE FUNCTION public.fn_audit_nf_seletivo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status_entrega IS NOT DISTINCT FROM NEW.status_entrega THEN
    RETURN NEW;
  END IF;
  PERFORM public.fn_audit_trigger();
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_audit_nfs_status
AFTER UPDATE OF status_entrega OR DELETE ON public.notas_fiscais
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('nf');

-- Agendamentos
CREATE TRIGGER trg_audit_agendamentos
AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('agendamento');

-- Etiquetas (apenas divergências, não cada conferência)
CREATE OR REPLACE FUNCTION public.fn_audit_etiqueta_divergencia()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
BEGIN
  -- Só loga quando vira divergência
  IF NEW.status = 'divergencia' AND (OLD.status IS DISTINCT FROM 'divergencia') THEN
    v_user_id := auth.uid();
    IF v_user_id IS NOT NULL THEN
      SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;
    END IF;

    INSERT INTO public.audit_log (
      user_id, user_email, action, entity_type, entity_id, changes
    ) VALUES (
      v_user_id, v_user_email, 'divergencia', 'etiqueta', NEW.id,
      jsonb_build_object(
        'numero_nf', NEW.numero_nf,
        'c_prod', NEW.c_prod,
        'seq', NEW.seq,
        'motivo', NEW.divergencia_motivo,
        'carga_id', NEW.carga_id
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_etiqueta_divergencia
AFTER UPDATE ON public.etiquetas
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_etiqueta_divergencia();

-- Baixas de entrega
CREATE TRIGGER trg_audit_baixas
AFTER INSERT OR UPDATE OR DELETE ON public.baixas_entrega
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('baixa');

-- Profiles (apenas role e ativo)
CREATE OR REPLACE FUNCTION public.fn_audit_profile_seguranca()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
  v_user_email text;
  v_changes jsonb := '{}'::jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    SELECT email INTO v_user_email FROM public.profiles WHERE id = v_user_id;
  END IF;

  IF OLD.role IS DISTINCT FROM NEW.role THEN
    v_changes := v_changes || jsonb_build_object('role',
      jsonb_build_object('before', OLD.role, 'after', NEW.role));
  END IF;
  IF OLD.ativo IS DISTINCT FROM NEW.ativo THEN
    v_changes := v_changes || jsonb_build_object('ativo',
      jsonb_build_object('before', OLD.ativo, 'after', NEW.ativo));
  END IF;
  IF OLD.pode_divergencia IS DISTINCT FROM NEW.pode_divergencia THEN
    v_changes := v_changes || jsonb_build_object('pode_divergencia',
      jsonb_build_object('before', OLD.pode_divergencia, 'after', NEW.pode_divergencia));
  END IF;

  IF v_changes <> '{}'::jsonb THEN
    INSERT INTO public.audit_log (
      user_id, user_email, action, entity_type, entity_id, changes,
      metadata
    ) VALUES (
      v_user_id, v_user_email, 'status_change', 'profile', NEW.id, v_changes,
      jsonb_build_object('target_email', NEW.email)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_audit_profile_seguranca
AFTER UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_profile_seguranca();

-- Veículos
CREATE TRIGGER trg_audit_veiculos
AFTER INSERT OR UPDATE OR DELETE ON public.veiculos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger('veiculo');

-- 7. RPC para listar logs com paginação e filtros (admin only)
CREATE OR REPLACE FUNCTION public.listar_audit_log(
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_user_id uuid DEFAULT NULL,
  p_entity_type text DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_action text DEFAULT NULL,
  p_data_inicio timestamp with time zone DEFAULT NULL,
  p_data_fim timestamp with time zone DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total bigint;
  v_rows jsonb;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  SELECT count(*) INTO v_total
  FROM public.audit_log
  WHERE (p_user_id IS NULL OR user_id = p_user_id)
    AND (p_entity_type IS NULL OR entity_type = p_entity_type)
    AND (p_entity_id IS NULL OR entity_id = p_entity_id)
    AND (p_action IS NULL OR action = p_action)
    AND (p_data_inicio IS NULL OR created_at >= p_data_inicio)
    AND (p_data_fim IS NULL OR created_at <= p_data_fim);

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, user_id, user_email, action, entity_type, entity_id,
           changes, metadata, created_at
    FROM public.audit_log
    WHERE (p_user_id IS NULL OR user_id = p_user_id)
      AND (p_entity_type IS NULL OR entity_type = p_entity_type)
      AND (p_entity_id IS NULL OR entity_id = p_entity_id)
      AND (p_action IS NULL OR action = p_action)
      AND (p_data_inicio IS NULL OR created_at >= p_data_inicio)
      AND (p_data_fim IS NULL OR created_at <= p_data_fim)
    ORDER BY created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN jsonb_build_object('total', v_total, 'rows', v_rows);
END;
$$;