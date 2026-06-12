-- 1. Adicionar campo ocorrencia em agendamentos
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS ocorrencia text;

-- 2. Incluir extravio_roubo no de-para da IBAC
INSERT INTO public.ibac_de_para_eventos (evento_interno, descricao_interna, codigo_ibac, descricao_ibac, ativo)
VALUES ('extravio_roubo', 'Extravio ou roubo de mercadoria', '14', 'Extravio de mercadoria', true)
ON CONFLICT (evento_interno) DO UPDATE
  SET codigo_ibac = EXCLUDED.codigo_ibac,
      descricao_ibac = EXCLUDED.descricao_ibac,
      ativo = true;

-- 3. Trigger: ao preencher/alterar a ocorrência do agendamento, enfileira evento IBAC
CREATE OR REPLACE FUNCTION public.fn_ibac_capturar_ocorrencia_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_nf record;
  v_payload jsonb;
BEGIN
  -- Só dispara quando ocorrencia é preenchida ou alterada para valor não vazio
  IF NEW.ocorrencia IS NULL OR btrim(NEW.ocorrencia) = '' THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.ocorrencia IS NOT DISTINCT FROM NEW.ocorrencia THEN
    RETURN NEW;
  END IF;

  -- Valida se o evento existe no de-para (ativo)
  IF NOT EXISTS (
    SELECT 1 FROM public.ibac_de_para_eventos
    WHERE evento_interno = NEW.ocorrencia AND ativo = true
  ) THEN
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
    'ocorrencia', NEW.ocorrencia,
    'origem', 'agendamento_manual',
    'status_agendamento', NEW.status,
    'data_agendamento', NEW.data_agendamento,
    'observacao', NEW.observacao,
    'registrado_em', now()
  );

  PERFORM public.fn_ibac_enqueue(
    NEW.ocorrencia, NEW.nf_id, v_nf.carga_id, NULL, v_nf.chave_acesso, v_payload
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ibac_ocorrencia_agendamento ON public.agendamentos;
CREATE TRIGGER trg_ibac_ocorrencia_agendamento
  AFTER INSERT OR UPDATE OF ocorrencia ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_ibac_capturar_ocorrencia_agendamento();