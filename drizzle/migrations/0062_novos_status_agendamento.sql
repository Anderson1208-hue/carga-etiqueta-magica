CREATE OR REPLACE FUNCTION public.validate_agendamento_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status NOT IN (
    'AGENDAMENTO',
    'AGUARDANDO AGENDA',
    'AGUARDANDO REAGENDA',
    'REENTREGA',
    'REENTREGA COM CUSTO',
    'REENTREGA SEM CUSTO',
    'PERDA DE AGENDAMENTO, AGUARDANDO NOVA AGENDA',
    'SINISTRO',
    'DEVOLUCAO',
    'ENTREGA IMEDIATA AGUARDANDO DEFINIÇÃO'
  ) THEN
    RAISE EXCEPTION 'status de agendamento inválido: %', NEW.status;
  END IF;
  IF NEW.status IN ('AGENDAMENTO', 'REENTREGA') AND NEW.data_agendamento IS NULL THEN
    RAISE EXCEPTION 'data_agendamento é obrigatória para status %', NEW.status;
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_reagenda_reabre_recusada()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status IN ('AGENDAMENTO', 'REENTREGA', 'REENTREGA COM CUSTO', 'REENTREGA SEM CUSTO') THEN
    UPDATE public.notas_fiscais nf
       SET status_entrega = 'CARGA NO DEPOSITO'
     WHERE nf.id = NEW.nf_id
       AND nf.status_entrega = 'RECUSADO'
       AND NOT EXISTS (SELECT 1 FROM public.veiculo_nfs v WHERE v.nf_id = nf.id);
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_ibac_capturar_agendamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_nf record;
  v_payload jsonb;
BEGIN
  IF NEW.status NOT IN ('AGENDAMENTO', 'REENTREGA', 'REENTREGA COM CUSTO', 'REENTREGA SEM CUSTO')
     OR NEW.data_agendamento IS NULL THEN
    RETURN NEW;
  END IF;

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
$function$;

CREATE OR REPLACE FUNCTION public.auto_agenda_por_cnpj()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cnpj_norm text;
  v_emit_norm text;
  v_status text;
BEGIN
  v_cnpj_norm := REGEXP_REPLACE(COALESCE(NEW.cnpj_destinatario, ''), '[^0-9]', '', 'g');
  v_emit_norm := upper(COALESCE(NEW.razao_social_emitente, ''));

  SELECT COALESCE(c.status, 'AGUARDANDO AGENDA') INTO v_status
  FROM public.cnpj_agenda_automatica c
  WHERE c.cnpj = v_cnpj_norm
    AND (c.emitente IS NULL OR v_emit_norm LIKE '%' || upper(c.emitente) || '%')
  ORDER BY (c.emitente IS NOT NULL) DESC
  LIMIT 1;

  IF v_status IS NOT NULL THEN
    INSERT INTO public.agendamentos (nf_id, status, data_agendamento)
    VALUES (
      NEW.id,
      v_status,
      CASE WHEN v_status IN ('AGENDAMENTO', 'REENTREGA') THEN CURRENT_DATE ELSE NULL END
    );
  END IF;
  RETURN NEW;
END;
$function$;