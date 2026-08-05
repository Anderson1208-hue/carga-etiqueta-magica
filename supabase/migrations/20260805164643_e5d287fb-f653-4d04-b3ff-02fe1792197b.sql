-- 1. apk_heartbeats: remover insert público (gravação real é via edge function service_role)
DROP POLICY IF EXISTS "apk_hb_insert_public" ON public.apk_heartbeats;
REVOKE INSERT, SELECT ON public.apk_heartbeats FROM anon;

CREATE POLICY "apk_hb_insert_service" ON public.apk_heartbeats
  FOR INSERT TO service_role WITH CHECK (true);

-- 2. search_path imutável
ALTER FUNCTION public.haversine_metros(numeric, numeric, numeric, numeric) SET search_path = public;
ALTER FUNCTION public.validate_monitoramento_parada_status() SET search_path = public;

-- 3. revogar EXECUTE de anon em funções SECURITY DEFINER que não devem ser públicas
REVOKE ALL ON FUNCTION public.detectar_paradas_suspeitas(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.fn_sync_rota_placa_motorista() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.importar_produtos_lote(jsonb) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.produtos_pendentes_cadastro(integer, text) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.aplicar_cubagem_produtos_nf(integer, boolean) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.enriquecer_cadastros_fiscais_lote(jsonb) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.provisionar_torre_dia(date) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.fn_promover_rota_por_gps() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.prevent_profile_privilege_escalation() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.rota_baixa_aderencia(uuid, integer) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.resolver_endereco_operacional(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.gerar_sugestoes_dwell_factual() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.pings_sugestao_coordenada(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.detectar_paradas_nao_programadas() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.reverter_admins_expirados() FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.revogar_admin_temporario(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.is_admin(uuid) FROM anon, PUBLIC;
REVOKE ALL ON FUNCTION public.promover_admin_temporario(uuid, integer) FROM anon, PUBLIC;

-- garantir que quem precisa continua executando
GRANT EXECUTE ON FUNCTION public.detectar_paradas_suspeitas(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.importar_produtos_lote(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.produtos_pendentes_cadastro(integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.aplicar_cubagem_produtos_nf(integer, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.enriquecer_cadastros_fiscais_lote(jsonb) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisionar_torre_dia(date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rota_baixa_aderencia(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolver_endereco_operacional(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.gerar_sugestoes_dwell_factual() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pings_sugestao_coordenada(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.detectar_paradas_nao_programadas() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reverter_admins_expirados() TO service_role;
GRANT EXECUTE ON FUNCTION public.revogar_admin_temporario(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_admin(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.promover_admin_temporario(uuid, integer) TO authenticated, service_role;