
-- Add access_code column to veiculos
ALTER TABLE public.veiculos
ADD COLUMN access_code text UNIQUE DEFAULT NULL;

-- Function to generate a short unique code
CREATE OR REPLACE FUNCTION public.generate_veiculo_access_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_code text;
  v_exists boolean;
BEGIN
  LOOP
    -- Generate 6-char alphanumeric code
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT EXISTS(SELECT 1 FROM veiculos WHERE access_code = v_code) INTO v_exists;
    EXIT WHEN NOT v_exists;
  END LOOP;
  NEW.access_code := v_code;
  RETURN NEW;
END;
$$;

-- Trigger to auto-generate code on insert
CREATE TRIGGER set_veiculo_access_code
BEFORE INSERT ON public.veiculos
FOR EACH ROW
WHEN (NEW.access_code IS NULL)
EXECUTE FUNCTION public.generate_veiculo_access_code();

-- Generate codes for existing vehicles
UPDATE public.veiculos SET access_code = upper(substr(md5(random()::text || id::text), 1, 6))
WHERE access_code IS NULL;
