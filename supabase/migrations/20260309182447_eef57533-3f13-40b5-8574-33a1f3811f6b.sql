
CREATE OR REPLACE FUNCTION public.auto_agenda_por_cnpj()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM cnpj_agenda_automatica 
    WHERE cnpj = REGEXP_REPLACE(NEW.cnpj_destinatario, '[^0-9]', '', 'g')
  ) THEN
    INSERT INTO agendamentos (nf_id, status)
    VALUES (NEW.id, 'AGUARDANDO AGENDA');
  END IF;
  RETURN NEW;
END;
$$;
