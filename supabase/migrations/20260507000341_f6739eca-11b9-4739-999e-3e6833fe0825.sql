
-- Fase D — Índices faltantes para queries frequentes

-- roteirizacao_paradas: usado com .in("roteirizacao_id", rotIds) em Roteirizacao
CREATE INDEX IF NOT EXISTS idx_rot_paradas_roteirizacao_id 
  ON public.roteirizacao_paradas (roteirizacao_id);

-- baixas_entrega: filtro frequente por status=entregue (Roteirizacao) e ordenação por registrado_em (Historico)
CREATE INDEX IF NOT EXISTS idx_baixas_entrega_status 
  ON public.baixas_entrega (status);
CREATE INDEX IF NOT EXISTS idx_baixas_entrega_registrado_em 
  ON public.baixas_entrega (registrado_em DESC);

-- agendamentos: filtros por status e ordenação por created_at (Agendamento.tsx)
CREATE INDEX IF NOT EXISTS idx_agendamentos_status 
  ON public.agendamentos (status);
CREATE INDEX IF NOT EXISTS idx_agendamentos_created_at 
  ON public.agendamentos (created_at DESC);

-- monitoramento_paradas: edge function GPS faz .eq(rota_id).order(ordem)
CREATE INDEX IF NOT EXISTS idx_mon_paradas_rota_ordem 
  ON public.monitoramento_paradas (monitoramento_rota_id, ordem);

-- carga_operadores: RLS is_carga_operator() faz EXISTS por (carga_id, operador_id)
CREATE INDEX IF NOT EXISTS idx_carga_operadores_carga_op 
  ON public.carga_operadores (carga_id, operador_id);
CREATE INDEX IF NOT EXISTS idx_carga_operadores_operador 
  ON public.carga_operadores (operador_id);

-- veiculos: BaixaEntrega/ConferenciaExterna filtram .in(status, ['pendente','em_rota'])
CREATE INDEX IF NOT EXISTS idx_veiculos_status 
  ON public.veiculos (status);

-- veiculos: created_by usado no DELETE policy de veiculo_nfs
CREATE INDEX IF NOT EXISTS idx_veiculos_created_by 
  ON public.veiculos (created_by);

-- ctes: chave_nf_referenciada usado em Roteirizacao para PDF
CREATE INDEX IF NOT EXISTS idx_ctes_chave_nf_ref 
  ON public.ctes (chave_nf_referenciada);

-- profiles: filtro is_active_operator() faz por (id, ativo)
CREATE INDEX IF NOT EXISTS idx_profiles_id_ativo 
  ON public.profiles (id, ativo);

-- Atualiza estatísticas para o planner usar os novos índices
ANALYZE public.roteirizacao_paradas;
ANALYZE public.baixas_entrega;
ANALYZE public.agendamentos;
ANALYZE public.monitoramento_paradas;
ANALYZE public.carga_operadores;
ANALYZE public.veiculos;
ANALYZE public.ctes;
ANALYZE public.profiles;
