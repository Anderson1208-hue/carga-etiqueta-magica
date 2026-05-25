
-- 1. Storage docs-publicos
DROP POLICY IF EXISTS "public read docs-publicos" ON storage.objects;

-- 2. Storage comprovantes — só admins/operadores
DROP POLICY IF EXISTS "Users can view comprovantes" ON storage.objects;
DROP POLICY IF EXISTS "Admins and operators can view comprovantes" ON storage.objects;
CREATE POLICY "Admins and operators can view comprovantes"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'comprovantes' AND (public.is_admin() OR public.is_active_operator()));

-- 3. prefatura_itens UPDATE policy
DROP POLICY IF EXISTS "Admins can update prefatura_itens" ON public.prefatura_itens;
CREATE POLICY "Admins can update prefatura_itens"
ON public.prefatura_itens FOR UPDATE
TO authenticated
USING (public.is_admin())
WITH CHECK (public.is_admin());

-- 4. Audit log partitions — admin SELECT
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'audit_log_2026_04','audit_log_2026_05','audit_log_2026_06',
    'audit_log_2026_07','audit_log_2026_08','audit_log_2026_09','audit_log_2026_10'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Admins can view partition" ON public.%I;', t);
    EXECUTE format('CREATE POLICY "Admins can view partition" ON public.%I FOR SELECT TO authenticated USING (public.is_admin());', t);
  END LOOP;
END $$;

-- 5. Revoga EXECUTE de triggers/helpers internos
REVOKE EXECUTE ON FUNCTION public.ensure_audit_log_partition() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fn_audit_etiqueta_divergencia() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fn_audit_nf_seletivo() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fn_audit_profile_seguranca() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fn_audit_trigger() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fn_auto_link_cadastros_nf() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fn_sync_nf_status_from_baixa() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.fn_sync_parada_from_baixa() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.generate_veiculo_access_code() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.auto_agenda_por_cnpj() FROM anon, authenticated, public;

-- 6. Revoga apenas anon de RPCs/helpers (mantém authenticated)
REVOKE EXECUTE ON FUNCTION public.adicionar_nfs_carga(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.importar_carga_xml_lote(jsonb) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_cargas_com_contagens() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_conferencia_progress(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.listar_audit_log(integer, integer, uuid, text, uuid, text, timestamptz, timestamptz) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.can_view_veiculo(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_admin() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_active_operator() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_carga_operator(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_profile() FROM anon, public;
