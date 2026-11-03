CREATE OR REPLACE FUNCTION public.pode_agente_gerencial()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (SELECT public.is_active_operator())
    AND ((SELECT public.is_admin())
      OR EXISTS (SELECT 1 FROM public.agente_gerencial_acessos WHERE user_id = auth.uid()))
$function$;

REVOKE ALL ON FUNCTION public.pode_agente_gerencial() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pode_agente_gerencial() TO authenticated, service_role;
GRANT SELECT ON public.agente_gerencial_acessos TO service_role;