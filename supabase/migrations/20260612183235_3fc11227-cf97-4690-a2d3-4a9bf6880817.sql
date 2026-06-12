
-- 1) Storage: comprovantes upload restrito
DROP POLICY IF EXISTS "Users can upload comprovantes" ON storage.objects;
CREATE POLICY "Admins and operators can upload comprovantes"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'comprovantes' AND (public.is_admin() OR public.is_active_operator()));

-- 2) audit_log INSERT
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_log;
CREATE POLICY "Admins and operators can insert audit logs"
ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (public.is_admin() OR public.is_active_operator());

-- 3) ibac_log_envios INSERT
DROP POLICY IF EXISTS "Service role insere log ibac" ON public.ibac_log_envios;
CREATE POLICY "Admins insere log ibac"
ON public.ibac_log_envios FOR INSERT TO authenticated
WITH CHECK (public.is_admin());

-- 4) Revogar EXECUTE de anon/public em funções internas SECURITY DEFINER
REVOKE EXECUTE ON FUNCTION public.fn_ibac_capturar_baixa() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_nfev_parada() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_nfev_enderecamento() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_nfev_agendamento() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_nfev_etiqueta() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_nfev_baixa() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_nfev_nf() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_nfev_actor() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_nfev_insert(uuid, text, timestamptz, uuid, text, jsonb, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.registrar_chegada_cd_manual(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_nfev_veiculo_nf() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_nfev_rota_iniciada() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_nfev_cte() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_ibac_capturar_ocorrencia_agendamento() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_ibac_capturar_carga_aceita() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_ibac_enqueue(text, uuid, uuid, uuid, text, jsonb) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_ibac_capturar_chegada_cliente() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_ibac_capturar_agendamento() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fn_ibac_capturar_inicio_rota() FROM PUBLIC, anon;

-- Garante que authenticated continua podendo chamar (RPC) o helper público
GRANT EXECUTE ON FUNCTION public.registrar_chegada_cd_manual(uuid, text) TO authenticated;

-- 5) Realtime: restringe canais a usuários autenticados aprovados
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Approved operators can read realtime" ON realtime.messages;
CREATE POLICY "Approved operators can read realtime"
ON realtime.messages FOR SELECT TO authenticated
USING (public.is_admin() OR public.is_active_operator());
