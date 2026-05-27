-- Função genérica para enfileirar eventos IBAC
CREATE OR REPLACE FUNCTION public.fn_ibac_enqueue(
  p_evento text,
  p_nf_id uuid,
  p_carga_id uuid,
  p_baixa_id uuid,
  p_chave_acesso text,
  p_payload jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Só enfileira se o evento existir no de-para e estiver ativo
  IF NOT EXISTS (
    SELECT 1 FROM public.ibac_de_para_eventos
    WHERE evento_interno = p_evento AND ativo = true
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.ibac_eventos_queue (
    evento_interno, nf_id, carga_id, baixa_id, chave_acesso, payload, status
  ) VALUES (
    p_evento, p_nf_id, p_carga_id, p_baixa_id, p_chave_acesso,
    COALESCE(p_payload, '{}'::jsonb), 'pendente'
  );
END;
$$;

-- Trigger 1: Baixa de entrega -> entrega_realizada / avaria / recusa_entrega / reentrega
CREATE OR REPLACE FUNCTION public.fn_ibac_capturar_baixa()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_evento text;
  v_nf record;
  v_payload jsonb;
BEGIN
  IF NEW.status = 'entregue' THEN
    v_evento := 'entrega_realizada';
  ELSIF lower(coalesce(NEW.ocorrencia,'')) = 'reentrega' THEN
    v_evento := 'reentrega';
  ELSIF lower(coalesce(NEW.ocorrencia,'')) IN ('avaria','avariado') THEN
    v_evento := 'avaria';
  ELSIF lower(coalesce(NEW.ocorrencia,'')) IN ('recusa','recusado','recusa_entrega') THEN
    v_evento := 'recusa_entrega';
  ELSIF lower(coalesce(NEW.ocorrencia,'')) IN ('devolucao','devolução') THEN
    v_evento := 'devolucao';
  ELSE
    RETURN NEW;
  END IF;

  SELECT chave_acesso, carga_id, numero_nf, cnpj_destinatario, dest_razao_social
    INTO v_nf FROM public.notas_fiscais WHERE id = NEW.nf_id;

  v_payload := jsonb_build_object(
    'nf_id', NEW.nf_id,
    'baixa_id', NEW.id,
    'numero_nf', v_nf.numero_nf,
    'chave_acesso', v_nf.chave_acesso,
    'cnpj_destinatario', v_nf.cnpj_destinatario,
    'dest_razao_social', v_nf.dest_razao_social,
    'ocorrencia', NEW.ocorrencia,
    'recebedor_nome', NEW.recebedor_nome,
    'latitude', NEW.latitude,
    'longitude', NEW.longitude,
    'registrado_em', NEW.registrado_em,
    'veiculo_id', NEW.veiculo_id
  );

  PERFORM public.fn_ibac_enqueue(
    v_evento, NEW.nf_id, v_nf.carga_id, NEW.id, v_nf.chave_acesso, v_payload
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ibac_capturar_baixa ON public.baixas_entrega;
CREATE TRIGGER trg_ibac_capturar_baixa
AFTER INSERT OR UPDATE OF status, ocorrencia ON public.baixas_entrega
FOR EACH ROW
EXECUTE FUNCTION public.fn_ibac_capturar_baixa();

-- Trigger 2: Agendamento -> agendamento
CREATE OR REPLACE FUNCTION public.fn_ibac_capturar_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nf record;
  v_payload jsonb;
BEGIN
  -- Só dispara quando há data confirmada (AGENDAMENTO ou REENTREGA)
  IF NEW.status NOT IN ('AGENDAMENTO','REENTREGA') OR NEW.data_agendamento IS NULL THEN
    RETURN NEW;
  END IF;

  -- Evita duplicidade em UPDATE sem mudança real
  IF TG_OP = 'UPDATE'
     AND OLD.status = NEW.status
     AND OLD.data_agendamento IS NOT DISTINCT FROM NEW.data_agendamento THEN
    RETURN NEW;
  END IF;

  SELECT chave_acesso, carga_id, numero_nf, cnpj_destinatario, dest_razao_social
    INTO v_nf FROM public.notas_fiscais WHERE id = NEW.nf_id;

  v_payload := jsonb_build_object(
    'nf_id', NEW.nf_id,
    'agendamento_id', NEW.id,
    'numero_nf', v_nf.numero_nf,
    'chave_acesso', v_nf.chave_acesso,
    'cnpj_destinatario', v_nf.cnpj_destinatario,
    'dest_razao_social', v_nf.dest_razao_social,
    'data_agendamento', NEW.data_agendamento,
    'status_agendamento', NEW.status,
    'observacao', NEW.observacao
  );

  PERFORM public.fn_ibac_enqueue(
    'agendamento', NEW.nf_id, v_nf.carga_id, NULL, v_nf.chave_acesso, v_payload
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ibac_capturar_agendamento ON public.agendamentos;
CREATE TRIGGER trg_ibac_capturar_agendamento
AFTER INSERT OR UPDATE OF status, data_agendamento ON public.agendamentos
FOR EACH ROW
EXECUTE FUNCTION public.fn_ibac_capturar_agendamento();

-- Trigger 3: Início de rota -> inicio_rota
CREATE OR REPLACE FUNCTION public.fn_ibac_capturar_inicio_rota()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nf record;
  v_payload jsonb;
BEGIN
  -- Dispara quando uma rota é criada com status 'ativa'
  IF NEW.status <> 'ativa' THEN
    RETURN NEW;
  END IF;

  -- Enfileira um evento para cada NF vinculada ao veículo desta rota
  FOR v_nf IN
    SELECT nf.id AS nf_id, nf.chave_acesso, nf.carga_id, nf.numero_nf,
           nf.cnpj_destinatario, nf.dest_razao_social
    FROM public.veiculo_nfs vnf
    JOIN public.notas_fiscais nf ON nf.id = vnf.nf_id
    WHERE vnf.veiculo_id = NEW.veiculo_id
  LOOP
    v_payload := jsonb_build_object(
      'nf_id', v_nf.nf_id,
      'rota_id', NEW.id,
      'veiculo_id', NEW.veiculo_id,
      'placa', NEW.placa,
      'motorista', NEW.motorista,
      'numero_nf', v_nf.numero_nf,
      'chave_acesso', v_nf.chave_acesso,
      'cnpj_destinatario', v_nf.cnpj_destinatario,
      'dest_razao_social', v_nf.dest_razao_social,
      'iniciada_em', NEW.created_at
    );

    PERFORM public.fn_ibac_enqueue(
      'inicio_rota', v_nf.nf_id, v_nf.carga_id, NULL, v_nf.chave_acesso, v_payload
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ibac_capturar_inicio_rota ON public.monitoramento_rotas;
CREATE TRIGGER trg_ibac_capturar_inicio_rota
AFTER INSERT ON public.monitoramento_rotas
FOR EACH ROW
EXECUTE FUNCTION public.fn_ibac_capturar_inicio_rota();

-- Trigger 4: Chegada ao cliente (parada finalizada via geofence ou baixa) -> chegada_cliente
CREATE OR REPLACE FUNCTION public.fn_ibac_capturar_chegada_cliente()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rota record;
  v_payload jsonb;
BEGIN
  -- Dispara quando uma parada muda para 'chegou_cliente' (não loga 'finalizada' para evitar duplicar com baixa)
  IF NEW.status <> 'chegou_cliente' OR OLD.status = 'chegou_cliente' THEN
    RETURN NEW;
  END IF;

  SELECT veiculo_id, placa, motorista
    INTO v_rota FROM public.monitoramento_rotas WHERE id = NEW.monitoramento_rota_id;

  v_payload := jsonb_build_object(
    'parada_id', NEW.id,
    'rota_id', NEW.monitoramento_rota_id,
    'cnpj_destinatario', NEW.cnpj_destinatario,
    'razao_social', NEW.razao_social,
    'endereco', NEW.endereco_completo,
    'ordem', NEW.ordem,
    'horario_chegada', NEW.horario_chegada,
    'latitude', NEW.latitude,
    'longitude', NEW.longitude,
    'placa', v_rota.placa,
    'motorista', v_rota.motorista
  );

  PERFORM public.fn_ibac_enqueue(
    'chegada_cliente', NULL, NULL, NULL, NULL, v_payload
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ibac_capturar_chegada_cliente ON public.monitoramento_paradas;
CREATE TRIGGER trg_ibac_capturar_chegada_cliente
AFTER UPDATE OF status ON public.monitoramento_paradas
FOR EACH ROW
EXECUTE FUNCTION public.fn_ibac_capturar_chegada_cliente();

-- Trigger 5: Carga aceita -> carga_aceita (quando status muda de 'fechada' para 'aberta')
CREATE OR REPLACE FUNCTION public.fn_ibac_capturar_carga_aceita()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_payload jsonb;
BEGIN
  IF NEW.status = OLD.status THEN RETURN NEW; END IF;
  IF NEW.status::text <> 'aberta' THEN RETURN NEW; END IF;

  v_payload := jsonb_build_object(
    'carga_id', NEW.id,
    'placa', NEW.placa,
    'motorista', NEW.motorista,
    'tipo_carga', NEW.tipo_carga,
    'data', NEW.data,
    'aceita_em', now()
  );

  PERFORM public.fn_ibac_enqueue(
    'carga_aceita', NULL, NEW.id, NULL, NULL, v_payload
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ibac_capturar_carga_aceita ON public.cargas;
CREATE TRIGGER trg_ibac_capturar_carga_aceita
AFTER UPDATE OF status ON public.cargas
FOR EACH ROW
EXECUTE FUNCTION public.fn_ibac_capturar_carga_aceita();