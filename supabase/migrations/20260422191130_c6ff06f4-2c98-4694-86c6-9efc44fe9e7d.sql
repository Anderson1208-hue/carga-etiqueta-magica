-- 1) Add emitente column to support per-issuer matrix
ALTER TABLE public.cnpj_agenda_automatica
  ADD COLUMN IF NOT EXISTS emitente text;

-- Drop old uniqueness on cnpj alone (if any) and create composite uniqueness
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'cnpj_agenda_automatica_cnpj_key'
  ) THEN
    ALTER TABLE public.cnpj_agenda_automatica DROP CONSTRAINT cnpj_agenda_automatica_cnpj_key;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS cnpj_agenda_automatica_cnpj_emitente_uniq
  ON public.cnpj_agenda_automatica (cnpj, COALESCE(upper(emitente), ''));

-- 2) Update trigger function to match by (CNPJ, emitente). 
-- emitente NULL = wildcard (vale para qualquer emitente, retrocompat).
CREATE OR REPLACE FUNCTION public.auto_agenda_por_cnpj()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cnpj_norm text;
  v_emit_norm text;
BEGIN
  v_cnpj_norm := REGEXP_REPLACE(COALESCE(NEW.cnpj_destinatario, ''), '[^0-9]', '', 'g');
  v_emit_norm := upper(COALESCE(NEW.razao_social_emitente, ''));

  IF EXISTS (
    SELECT 1 FROM cnpj_agenda_automatica
    WHERE cnpj = v_cnpj_norm
      AND (
        emitente IS NULL
        OR v_emit_norm LIKE '%' || upper(emitente) || '%'
      )
  ) THEN
    INSERT INTO agendamentos (nf_id, status)
    VALUES (NEW.id, 'AGUARDANDO AGENDA');
  END IF;
  RETURN NEW;
END;
$function$;

-- 3) Ensure trigger exists on notas_fiscais
DROP TRIGGER IF EXISTS trg_auto_agenda_por_cnpj ON public.notas_fiscais;
CREATE TRIGGER trg_auto_agenda_por_cnpj
  AFTER INSERT ON public.notas_fiscais
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_agenda_por_cnpj();