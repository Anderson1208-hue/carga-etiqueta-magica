
-- =========================================================
-- 1) Tabela nf_eventos (event store)
-- =========================================================
CREATE TABLE public.nf_eventos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nf_id uuid NOT NULL REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
  tipo text NOT NULL,
  ocorrido_em timestamptz NOT NULL DEFAULT now(),
  ator_id uuid,
  ator_nome text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem text NOT NULL DEFAULT 'trigger',
  dedupe_key text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_nf_eventos_nf_ocorrido ON public.nf_eventos (nf_id, ocorrido_em);
CREATE INDEX idx_nf_eventos_tipo ON public.nf_eventos (tipo);

GRANT SELECT ON public.nf_eventos TO authenticated;
GRANT ALL ON public.nf_eventos TO service_role;

ALTER TABLE public.nf_eventos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin e operador ativo leem histórico"
  ON public.nf_eventos FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_active_operator());

-- Sem policy de INSERT/UPDATE/DELETE para authenticated.
-- Só funções SECURITY DEFINER e service_role escrevem.

-- =========================================================
-- 2) Helper: nome do ator a partir do auth.uid()
-- =========================================================
CREATE OR REPLACE FUNCTION public.fn_nfev_actor()
RETURNS TABLE(ator_id uuid, ator_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT auth.uid(),
         (SELECT COALESCE(full_name, email) FROM public.profiles WHERE id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.fn_nfev_insert(
  p_nf_id uuid, p_tipo text, p_ocorrido_em timestamptz,
  p_ator_id uuid, p_ator_nome text, p_payload jsonb,
  p_origem text, p_dedupe_key text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.nf_eventos (
    nf_id, tipo, ocorrido_em, ator_id, ator_nome,
    payload, origem, dedupe_key
  ) VALUES (
    p_nf_id, p_tipo, COALESCE(p_ocorrido_em, now()), p_ator_id, p_ator_nome,
    COALESCE(p_payload,'{}'::jsonb), COALESCE(p_origem,'trigger'), p_dedupe_key
  )
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

-- =========================================================
-- 3) Triggers
-- =========================================================

-- 3.1 notas_fiscais: nf_emitida + nf_incluida
CREATE OR REPLACE FUNCTION public.tg_nfev_nf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  PERFORM public.fn_nfev_insert(
    NEW.id, 'nf_emitida',
    COALESCE(NEW.data_emissao::timestamptz, NEW.created_at),
    NULL, NEW.razao_social_emitente,
    jsonb_build_object('numero_nf', NEW.numero_nf, 'emitente', NEW.razao_social_emitente,
                       'cnpj_emitente', NEW.cnpj_emitente, 'valor_nf', NEW.valor_nf),
    'trigger', 'nf_emitida:'||NEW.id::text
  );
  PERFORM public.fn_nfev_insert(
    NEW.id, 'nf_incluida', NEW.created_at,
    NULL, NULL,
    jsonb_build_object('carga_id', NEW.carga_id, 'numero_nf', NEW.numero_nf),
    'trigger', 'nf_incluida:'||NEW.id::text
  );
  RETURN NEW;
END $$;

CREATE TRIGGER tg_nfev_nf_insert
  AFTER INSERT ON public.notas_fiscais
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_nf();

-- 3.2 agendamentos
CREATE OR REPLACE FUNCTION public.tg_nfev_agendamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ator_nome text;
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_ator_nome
      FROM public.profiles WHERE id = NEW.created_by;
  END IF;
  PERFORM public.fn_nfev_insert(
    NEW.nf_id, 'agendada', COALESCE(NEW.updated_at, NEW.created_at, now()),
    NEW.created_by, v_ator_nome,
    jsonb_build_object('agendamento_id', NEW.id, 'status', NEW.status,
                       'data_agendamento', NEW.data_agendamento, 'observacao', NEW.observacao),
    'trigger',
    'agendamento:'||NEW.id::text||':'||COALESCE(NEW.status,'')||':'||COALESCE(NEW.data_agendamento::text,'')
  );
  RETURN NEW;
END $$;

CREATE TRIGGER tg_nfev_agendamento_iu
  AFTER INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_agendamento();

-- 3.3 nf_enderecamento
CREATE OR REPLACE FUNCTION public.tg_nfev_enderecamento()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ator_nome text;
BEGIN
  IF NEW.created_by IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_ator_nome
      FROM public.profiles WHERE id = NEW.created_by;
  END IF;
  PERFORM public.fn_nfev_insert(
    NEW.nf_id, 'enderecada', NEW.created_at, NEW.created_by, v_ator_nome,
    jsonb_build_object('posicao', NEW.posicao, 'principal', NEW.principal),
    'trigger', 'enderecamento:'||NEW.id::text
  );
  RETURN NEW;
END $$;

CREATE TRIGGER tg_nfev_enderecamento_i
  AFTER INSERT ON public.nf_enderecamento
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_enderecamento();

-- 3.4 veiculo_nfs (expedição)
CREATE OR REPLACE FUNCTION public.tg_nfev_veiculo_nf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_placa text; v_motorista text; v_ator uuid; v_ator_nome text;
BEGIN
  SELECT placa, motorista INTO v_placa, v_motorista
    FROM public.veiculos WHERE id = NEW.veiculo_id;
  SELECT * INTO v_ator, v_ator_nome FROM public.fn_nfev_actor();
  PERFORM public.fn_nfev_insert(
    NEW.nf_id, 'expedicao_veiculo', NEW.created_at, v_ator, v_ator_nome,
    jsonb_build_object('veiculo_id', NEW.veiculo_id, 'placa', v_placa,
                       'motorista', v_motorista, 'carga_origem_id', NEW.carga_origem_id),
    'trigger', 'vnf:'||NEW.id::text
  );
  RETURN NEW;
END $$;

CREATE TRIGGER tg_nfev_veiculo_nf_i
  AFTER INSERT ON public.veiculo_nfs
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_veiculo_nf();

-- 3.5 etiquetas: conferência interna/externa, divergência, chegada_cd
CREATE OR REPLACE FUNCTION public.tg_nfev_etiqueta()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_ator_nome text;
  v_st text := NEW.status::text;
  v_old_st text := COALESCE(OLD.status::text, '');
BEGIN
  IF v_st = v_old_st THEN RETURN NEW; END IF;

  IF v_st = 'conferido_interno' THEN
    IF NEW.conferido_interno_por IS NOT NULL THEN
      SELECT COALESCE(full_name, email) INTO v_ator_nome
        FROM public.profiles WHERE id = NEW.conferido_interno_por;
    END IF;
    PERFORM public.fn_nfev_insert(
      NEW.nf_id, 'conferencia_interna',
      COALESCE(NEW.conferido_interno_em, now()),
      NEW.conferido_interno_por, v_ator_nome,
      jsonb_build_object('etiqueta_id', NEW.id, 'c_prod', NEW.c_prod,
                         'seq', NEW.seq, 'total', NEW.total, 'carga_id', NEW.carga_id),
      'trigger', 'etq_interna:'||NEW.id::text
    );
    -- chegada_cd no 1º bip da NF
    PERFORM public.fn_nfev_insert(
      NEW.nf_id, 'chegada_cd',
      COALESCE(NEW.conferido_interno_em, now()),
      NEW.conferido_interno_por, v_ator_nome,
      jsonb_build_object('origem','fallback_conferencia', 'etiqueta_id', NEW.id),
      'trigger', 'chegada_cd:'||NEW.nf_id::text
    );
  ELSIF v_st = 'conferido' THEN
    IF NEW.conferido_por IS NOT NULL THEN
      SELECT COALESCE(full_name, email) INTO v_ator_nome
        FROM public.profiles WHERE id = NEW.conferido_por;
    END IF;
    PERFORM public.fn_nfev_insert(
      NEW.nf_id, 'conferencia_externa',
      COALESCE(NEW.conferido_em, now()),
      NEW.conferido_por, v_ator_nome,
      jsonb_build_object('etiqueta_id', NEW.id, 'c_prod', NEW.c_prod,
                         'seq', NEW.seq, 'total', NEW.total, 'carga_id', NEW.carga_id),
      'trigger', 'etq_externa:'||NEW.id::text
    );
  ELSIF v_st = 'divergencia' THEN
    IF NEW.divergencia_por IS NOT NULL THEN
      SELECT COALESCE(full_name, email) INTO v_ator_nome
        FROM public.profiles WHERE id = NEW.divergencia_por;
    END IF;
    PERFORM public.fn_nfev_insert(
      NEW.nf_id, 'divergencia',
      COALESCE(NEW.divergencia_em, now()),
      NEW.divergencia_por, v_ator_nome,
      jsonb_build_object('etiqueta_id', NEW.id, 'c_prod', NEW.c_prod,
                         'seq', NEW.seq, 'motivo', NEW.divergencia_motivo),
      'trigger', 'etq_diverg:'||NEW.id::text
    );
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_nfev_etiqueta_u
  AFTER UPDATE ON public.etiquetas
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_etiqueta();

-- 3.6 monitoramento_paradas: chegada_cliente
CREATE OR REPLACE FUNCTION public.tg_nfev_parada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_nf record;
BEGIN
  IF NEW.status NOT IN ('chegou_cliente','finalizada') THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.cnpj_destinatario IS NULL THEN RETURN NEW; END IF;

  -- Casa todas as NFs do mesmo CNPJ ainda em rota nesta carga
  FOR v_nf IN
    SELECT DISTINCT nf.id
      FROM public.notas_fiscais nf
      JOIN public.veiculo_nfs vnf ON vnf.nf_id = nf.id
      JOIN public.monitoramento_rotas r ON r.id = NEW.monitoramento_rota_id
     WHERE nf.cnpj_destinatario = NEW.cnpj_destinatario
       AND vnf.veiculo_id = r.veiculo_id
  LOOP
    PERFORM public.fn_nfev_insert(
      v_nf.id, 'chegada_cliente',
      COALESCE(NEW.horario_chegada, now()),
      NULL, NULL,
      jsonb_build_object('parada_id', NEW.id, 'rota_id', NEW.monitoramento_rota_id,
                         'cnpj_destinatario', NEW.cnpj_destinatario, 'endereco', NEW.endereco_completo,
                         'lat', NEW.latitude, 'lng', NEW.longitude),
      'trigger', 'parada:'||NEW.id::text||':'||v_nf.id::text
    );
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_nfev_parada_u
  AFTER UPDATE ON public.monitoramento_paradas
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_parada();

-- 3.7 baixas_entrega
CREATE OR REPLACE FUNCTION public.tg_nfev_baixa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_tipo text;
  v_ator_nome text;
  v_oc text := lower(coalesce(NEW.ocorrencia,''));
BEGIN
  IF NEW.status = 'entregue' THEN v_tipo := 'entrega';
  ELSIF v_oc = 'reentrega' THEN v_tipo := 'reentrega';
  ELSE v_tipo := 'recusa';
  END IF;

  IF NEW.registrado_por IS NOT NULL THEN
    SELECT COALESCE(full_name, email) INTO v_ator_nome
      FROM public.profiles WHERE id = NEW.registrado_por;
  END IF;

  PERFORM public.fn_nfev_insert(
    NEW.nf_id, v_tipo,
    COALESCE(NEW.registrado_em, now()),
    NEW.registrado_por,
    COALESCE(v_ator_nome, NEW.recebedor_nome),
    jsonb_build_object('baixa_id', NEW.id, 'status', NEW.status,
                       'ocorrencia', NEW.ocorrencia, 'recebedor_nome', NEW.recebedor_nome,
                       'veiculo_id', NEW.veiculo_id, 'lat', NEW.latitude, 'lng', NEW.longitude,
                       'foto_path', NEW.foto_path),
    'trigger', 'baixa:'||NEW.id::text
  );
  RETURN NEW;
END $$;

CREATE TRIGGER tg_nfev_baixa_i
  AFTER INSERT ON public.baixas_entrega
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_baixa();

-- 3.8 ctes: vínculo de CT-e/Minuta
CREATE OR REPLACE FUNCTION public.tg_nfev_cte()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_nf record;
BEGIN
  -- Casa por chave_acesso da NF; se faltar, casa por numero_nf normalizado dentro da mesma carga
  FOR v_nf IN
    SELECT nf.id
      FROM public.notas_fiscais nf
     WHERE (NEW.chave_nf_referenciada IS NOT NULL
             AND nf.chave_acesso = NEW.chave_nf_referenciada)
        OR (NEW.numero_nf_referenciada IS NOT NULL
             AND NEW.carga_id IS NOT NULL
             AND nf.carga_id = NEW.carga_id
             AND ltrim(nf.numero_nf,'0') = ltrim(NEW.numero_nf_referenciada,'0'))
  LOOP
    PERFORM public.fn_nfev_insert(
      v_nf.id, 'cte_vinculado',
      COALESCE(NEW.data_emissao::timestamptz, NEW.created_at),
      NULL, NULL,
      jsonb_build_object('cte_id', NEW.id, 'tipo_documento', NEW.tipo_documento,
                         'numero_cte', NEW.numero_cte, 'chave_cte', NEW.chave_cte,
                         'cnpj_emitente', NEW.cnpj_emitente, 'razao_social', NEW.razao_social_emitente,
                         'valor_frete', NEW.valor_frete),
      'trigger', 'cte:'||NEW.id::text||':'||v_nf.id::text
    );
  END LOOP;
  RETURN NEW;
END $$;

CREATE TRIGGER tg_nfev_cte_i
  AFTER INSERT ON public.ctes
  FOR EACH ROW EXECUTE FUNCTION public.tg_nfev_cte();

-- =========================================================
-- 4) RPC: chegada manual no CD
-- =========================================================
CREATE OR REPLACE FUNCTION public.registrar_chegada_cd_manual(p_nf_id uuid, p_observacao text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_ator uuid; v_ator_nome text; v_existe boolean;
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.notas_fiscais WHERE id = p_nf_id) THEN
    RAISE EXCEPTION 'NF não encontrada';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.nf_eventos
    WHERE nf_id = p_nf_id AND tipo = 'chegada_cd'
  ) INTO v_existe;

  IF v_existe THEN
    RETURN jsonb_build_object('status','ja_registrado');
  END IF;

  SELECT * INTO v_ator, v_ator_nome FROM public.fn_nfev_actor();

  PERFORM public.fn_nfev_insert(
    p_nf_id, 'chegada_cd', now(), v_ator, v_ator_nome,
    jsonb_build_object('origem','manual','observacao', p_observacao),
    'manual', 'chegada_cd:'||p_nf_id::text
  );
  RETURN jsonb_build_object('status','ok');
END $$;

GRANT EXECUTE ON FUNCTION public.registrar_chegada_cd_manual(uuid, text) TO authenticated;

-- =========================================================
-- 5) Backfill idempotente
-- =========================================================

-- nf_emitida + nf_incluida
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_nome, payload, origem, dedupe_key)
SELECT nf.id, 'nf_emitida',
  COALESCE(nf.data_emissao::timestamptz, nf.created_at),
  nf.razao_social_emitente,
  jsonb_build_object('numero_nf', nf.numero_nf, 'emitente', nf.razao_social_emitente,
                     'cnpj_emitente', nf.cnpj_emitente, 'valor_nf', nf.valor_nf),
  'backfill', 'nf_emitida:'||nf.id::text
FROM public.notas_fiscais nf
ON CONFLICT (dedupe_key) DO NOTHING;

INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, payload, origem, dedupe_key)
SELECT nf.id, 'nf_incluida', nf.created_at,
  jsonb_build_object('carga_id', nf.carga_id, 'numero_nf', nf.numero_nf),
  'backfill', 'nf_incluida:'||nf.id::text
FROM public.notas_fiscais nf
ON CONFLICT (dedupe_key) DO NOTHING;

-- agendamentos
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key)
SELECT a.nf_id, 'agendada',
  COALESCE(a.updated_at, a.created_at),
  a.created_by,
  (SELECT COALESCE(full_name,email) FROM public.profiles WHERE id = a.created_by),
  jsonb_build_object('agendamento_id', a.id, 'status', a.status,
                     'data_agendamento', a.data_agendamento, 'observacao', a.observacao),
  'backfill',
  'agendamento:'||a.id::text||':'||COALESCE(a.status,'')||':'||COALESCE(a.data_agendamento::text,'')
FROM public.agendamentos a
ON CONFLICT (dedupe_key) DO NOTHING;

-- nf_enderecamento
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key)
SELECT e.nf_id, 'enderecada', e.created_at, e.created_by,
  (SELECT COALESCE(full_name,email) FROM public.profiles WHERE id = e.created_by),
  jsonb_build_object('posicao', e.posicao, 'principal', e.principal),
  'backfill', 'enderecamento:'||e.id::text
FROM public.nf_enderecamento e
ON CONFLICT (dedupe_key) DO NOTHING;

-- veiculo_nfs
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, payload, origem, dedupe_key)
SELECT vnf.nf_id, 'expedicao_veiculo', vnf.created_at,
  jsonb_build_object('veiculo_id', vnf.veiculo_id,
                     'placa', (SELECT placa FROM public.veiculos WHERE id = vnf.veiculo_id),
                     'motorista', (SELECT motorista FROM public.veiculos WHERE id = vnf.veiculo_id),
                     'carga_origem_id', vnf.carga_origem_id),
  'backfill', 'vnf:'||vnf.id::text
FROM public.veiculo_nfs vnf
ON CONFLICT (dedupe_key) DO NOTHING;

-- etiquetas: conferência interna
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key)
SELECT e.nf_id, 'conferencia_interna', e.conferido_interno_em, e.conferido_interno_por,
  (SELECT COALESCE(full_name,email) FROM public.profiles WHERE id = e.conferido_interno_por),
  jsonb_build_object('etiqueta_id', e.id, 'c_prod', e.c_prod, 'seq', e.seq, 'total', e.total, 'carga_id', e.carga_id),
  'backfill', 'etq_interna:'||e.id::text
FROM public.etiquetas e
WHERE e.conferido_interno_em IS NOT NULL
ON CONFLICT (dedupe_key) DO NOTHING;

-- etiquetas: conferência externa
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key)
SELECT e.nf_id, 'conferencia_externa', e.conferido_em, e.conferido_por,
  (SELECT COALESCE(full_name,email) FROM public.profiles WHERE id = e.conferido_por),
  jsonb_build_object('etiqueta_id', e.id, 'c_prod', e.c_prod, 'seq', e.seq, 'total', e.total, 'carga_id', e.carga_id),
  'backfill', 'etq_externa:'||e.id::text
FROM public.etiquetas e
WHERE e.conferido_em IS NOT NULL
ON CONFLICT (dedupe_key) DO NOTHING;

-- etiquetas: divergência
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key)
SELECT e.nf_id, 'divergencia', e.divergencia_em, e.divergencia_por,
  (SELECT COALESCE(full_name,email) FROM public.profiles WHERE id = e.divergencia_por),
  jsonb_build_object('etiqueta_id', e.id, 'c_prod', e.c_prod, 'seq', e.seq, 'motivo', e.divergencia_motivo),
  'backfill', 'etq_diverg:'||e.id::text
FROM public.etiquetas e
WHERE e.divergencia_em IS NOT NULL
ON CONFLICT (dedupe_key) DO NOTHING;

-- chegada_cd: 1º bip interno por NF
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key)
SELECT DISTINCT ON (e.nf_id)
  e.nf_id, 'chegada_cd', e.conferido_interno_em, e.conferido_interno_por,
  (SELECT COALESCE(full_name,email) FROM public.profiles WHERE id = e.conferido_interno_por),
  jsonb_build_object('origem','fallback_conferencia','etiqueta_id', e.id),
  'backfill', 'chegada_cd:'||e.nf_id::text
FROM public.etiquetas e
WHERE e.conferido_interno_em IS NOT NULL
ORDER BY e.nf_id, e.conferido_interno_em ASC
ON CONFLICT (dedupe_key) DO NOTHING;

-- baixas_entrega
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, ator_id, ator_nome, payload, origem, dedupe_key)
SELECT b.nf_id,
  CASE WHEN b.status = 'entregue' THEN 'entrega'
       WHEN lower(coalesce(b.ocorrencia,'')) = 'reentrega' THEN 'reentrega'
       ELSE 'recusa' END,
  COALESCE(b.registrado_em, b.created_at),
  b.registrado_por,
  COALESCE((SELECT COALESCE(full_name,email) FROM public.profiles WHERE id = b.registrado_por), b.recebedor_nome),
  jsonb_build_object('baixa_id', b.id, 'status', b.status,
                     'ocorrencia', b.ocorrencia, 'recebedor_nome', b.recebedor_nome,
                     'veiculo_id', b.veiculo_id, 'lat', b.latitude, 'lng', b.longitude,
                     'foto_path', b.foto_path),
  'backfill', 'baixa:'||b.id::text
FROM public.baixas_entrega b
ON CONFLICT (dedupe_key) DO NOTHING;

-- ctes
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, payload, origem, dedupe_key)
SELECT nf.id, 'cte_vinculado',
  COALESCE(c.data_emissao::timestamptz, c.created_at),
  jsonb_build_object('cte_id', c.id, 'tipo_documento', c.tipo_documento,
                     'numero_cte', c.numero_cte, 'chave_cte', c.chave_cte,
                     'cnpj_emitente', c.cnpj_emitente, 'razao_social', c.razao_social_emitente,
                     'valor_frete', c.valor_frete),
  'backfill', 'cte:'||c.id::text||':'||nf.id::text
FROM public.ctes c
JOIN public.notas_fiscais nf
  ON (c.chave_nf_referenciada IS NOT NULL AND nf.chave_acesso = c.chave_nf_referenciada)
  OR (c.numero_nf_referenciada IS NOT NULL AND c.carga_id IS NOT NULL
      AND nf.carga_id = c.carga_id
      AND ltrim(nf.numero_nf,'0') = ltrim(c.numero_nf_referenciada,'0'))
ON CONFLICT (dedupe_key) DO NOTHING;

-- monitoramento_paradas (chegada_cliente) backfill
INSERT INTO public.nf_eventos (nf_id, tipo, ocorrido_em, payload, origem, dedupe_key)
SELECT DISTINCT nf.id, 'chegada_cliente',
  COALESCE(p.horario_chegada, p.created_at),
  jsonb_build_object('parada_id', p.id, 'rota_id', p.monitoramento_rota_id,
                     'cnpj_destinatario', p.cnpj_destinatario, 'endereco', p.endereco_completo,
                     'lat', p.latitude, 'lng', p.longitude),
  'backfill', 'parada:'||p.id::text||':'||nf.id::text
FROM public.monitoramento_paradas p
JOIN public.monitoramento_rotas r ON r.id = p.monitoramento_rota_id
JOIN public.veiculo_nfs vnf ON vnf.veiculo_id = r.veiculo_id
JOIN public.notas_fiscais nf ON nf.id = vnf.nf_id
WHERE p.status IN ('chegou_cliente','finalizada')
  AND p.cnpj_destinatario IS NOT NULL
  AND nf.cnpj_destinatario = p.cnpj_destinatario
ON CONFLICT (dedupe_key) DO NOTHING;
