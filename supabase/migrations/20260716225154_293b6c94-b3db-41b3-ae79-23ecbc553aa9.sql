CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se quem está executando é admin, permite qualquer alteração
  IF public.is_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Caso contrário, bloqueia mudança em colunas sensíveis
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'Não é permitido alterar a coluna role';
  END IF;

  IF NEW.ativo IS DISTINCT FROM OLD.ativo THEN
    RAISE EXCEPTION 'Não é permitido alterar a coluna ativo';
  END IF;

  IF NEW.pode_divergencia IS DISTINCT FROM OLD.pode_divergencia THEN
    RAISE EXCEPTION 'Não é permitido alterar a coluna pode_divergencia';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_privilege_escalation ON public.profiles;

CREATE TRIGGER trg_prevent_profile_privilege_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_privilege_escalation();