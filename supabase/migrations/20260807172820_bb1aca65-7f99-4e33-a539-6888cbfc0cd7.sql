CREATE OR REPLACE FUNCTION public.pode_limpar_conferencia()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
      AND p.ativo = true
      AND (p.role = 'admin'::app_role OR lower(p.email) = 'gessica.rodrigues@tlmlogistica.com.br')
  )
$$;

REVOKE EXECUTE ON FUNCTION public.pode_limpar_conferencia() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pode_limpar_conferencia() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.limpar_conferencia_nf(p_numero_nf text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_afetadas integer;
BEGIN
  IF NOT public.pode_limpar_conferencia() THEN
    RAISE EXCEPTION 'Sem permissão para limpar conferência';
  END IF;

  UPDATE public.etiquetas
     SET status = 'pendente'::label_status,
         conferido_em = NULL,
         conferido_por = NULL,
         conferido_interno_em = NULL,
         conferido_interno_por = NULL,
         divergencia_motivo = NULL
   WHERE numero_nf = p_numero_nf
     AND status <> 'pendente'::label_status;

  GET DIAGNOSTICS v_afetadas = ROW_COUNT;

  RETURN jsonb_build_object('numero_nf', p_numero_nf, 'etiquetas_limpas', v_afetadas);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.limpar_conferencia_nf(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.limpar_conferencia_nf(text) TO authenticated, service_role;