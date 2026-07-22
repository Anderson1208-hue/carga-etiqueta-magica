
-- 1. Colunas de controle de promoção temporária
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role_anterior public.app_role,
  ADD COLUMN IF NOT EXISTS role_expira_em timestamptz,
  ADD COLUMN IF NOT EXISTS promovido_por uuid REFERENCES auth.users(id);

-- 2. Função para promover a admin temporário
CREATE OR REPLACE FUNCTION public.promover_admin_temporario(
  _user_id uuid,
  _dias integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_atual public.app_role;
BEGIN
  -- Apenas admins podem promover
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem promover operadores';
  END IF;

  IF _dias < 1 OR _dias > 30 THEN
    RAISE EXCEPTION 'Prazo deve ser entre 1 e 30 dias';
  END IF;

  SELECT role INTO v_role_atual FROM public.profiles WHERE id = _user_id;
  IF v_role_atual IS NULL THEN
    RAISE EXCEPTION 'Operador não encontrado';
  END IF;

  IF v_role_atual = 'admin' THEN
    RAISE EXCEPTION 'Operador já é administrador';
  END IF;

  UPDATE public.profiles
     SET role = 'admin',
         role_anterior = v_role_atual,
         role_expira_em = now() + (_dias || ' days')::interval,
         promovido_por = auth.uid(),
         ativo = true
   WHERE id = _user_id;

  -- Mantém também a tabela user_roles em sincronia (caso exista/uso)
  INSERT INTO public.user_roles (user_id, role)
    VALUES (_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
END;
$$;

-- 3. Função para revogar manualmente
CREATE OR REPLACE FUNCTION public.revogar_admin_temporario(_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_anterior public.app_role;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN
    RAISE EXCEPTION 'Apenas administradores podem revogar';
  END IF;

  SELECT role_anterior INTO v_role_anterior
    FROM public.profiles WHERE id = _user_id;

  IF v_role_anterior IS NULL THEN
    RAISE EXCEPTION 'Este operador não é admin temporário';
  END IF;

  UPDATE public.profiles
     SET role = v_role_anterior,
         role_anterior = NULL,
         role_expira_em = NULL,
         promovido_por = NULL
   WHERE id = _user_id;

  DELETE FROM public.user_roles
    WHERE user_id = _user_id AND role = 'admin';
END;
$$;

-- 4. Reversão automática de expirados
CREATE OR REPLACE FUNCTION public.reverter_admins_expirados()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  r record;
BEGIN
  FOR r IN
    SELECT id, role_anterior
      FROM public.profiles
     WHERE role_expira_em IS NOT NULL
       AND role_expira_em <= now()
       AND role_anterior IS NOT NULL
  LOOP
    UPDATE public.profiles
       SET role = r.role_anterior,
           role_anterior = NULL,
           role_expira_em = NULL,
           promovido_por = NULL
     WHERE id = r.id;

    DELETE FROM public.user_roles
      WHERE user_id = r.id AND role = 'admin';

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promover_admin_temporario(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revogar_admin_temporario(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reverter_admins_expirados() TO authenticated, service_role;
