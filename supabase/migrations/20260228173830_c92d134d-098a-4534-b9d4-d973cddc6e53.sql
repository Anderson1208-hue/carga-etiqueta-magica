
-- Add tipo_carga column to cargas table
ALTER TABLE public.cargas 
ADD COLUMN tipo_carga text NOT NULL DEFAULT 'SECA';

-- Add a check constraint for valid values
CREATE OR REPLACE FUNCTION public.validate_tipo_carga()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.tipo_carga NOT IN ('SECA', 'CHOCOLATE') THEN
    RAISE EXCEPTION 'tipo_carga must be SECA or CHOCOLATE';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_tipo_carga_trigger
BEFORE INSERT OR UPDATE ON public.cargas
FOR EACH ROW
EXECUTE FUNCTION public.validate_tipo_carga();
