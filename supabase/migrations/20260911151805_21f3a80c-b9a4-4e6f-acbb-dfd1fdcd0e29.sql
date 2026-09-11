ALTER TABLE public.cnpj_agenda_automatica
  ADD COLUMN IF NOT EXISTS embarcador_id uuid REFERENCES public.embarcadores(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'AGUARDANDO AGENDA';

CREATE OR REPLACE FUNCTION public.auto_agenda_por_cnpj()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cnpj_norm text;
  v_emit_norm text;
  v_status text;
BEGIN
  v_cnpj_norm := REGEXP_REPLACE(COALESCE(NEW.cnpj_destinatario, ''), '[^0-9]', '', 'g');
  v_emit_norm := upper(COALESCE(NEW.razao_social_emitente, ''));

  SELECT COALESCE(c.status, 'AGUARDANDO AGENDA') INTO v_status
  FROM cnpj_agenda_automatica c
  WHERE c.cnpj = v_cnpj_norm
    AND (c.emitente IS NULL OR v_emit_norm LIKE '%' || upper(c.emitente) || '%')
  ORDER BY (c.emitente IS NOT NULL) DESC
  LIMIT 1;

  IF v_status IS NOT NULL THEN
    INSERT INTO agendamentos (nf_id, status, data_agendamento)
    VALUES (
      NEW.id,
      v_status,
      CASE WHEN v_status IN ('AGENDAMENTO', 'REENTREGA') THEN CURRENT_DATE ELSE NULL END
    );
  END IF;
  RETURN NEW;
END;
$$;