
-- Indices para acelerar buscas frequentes nas telas operacionais

-- notas_fiscais: número da NF (busca em Consulta NF, Programação) e CNPJ destinatário (filtros)
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_numero_nf ON public.notas_fiscais USING btree (numero_nf);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_cnpj_destinatario ON public.notas_fiscais USING btree (cnpj_destinatario);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_data_emissao ON public.notas_fiscais USING btree (data_emissao DESC);
CREATE INDEX IF NOT EXISTS idx_notas_fiscais_created_at ON public.notas_fiscais USING btree (created_at DESC);

-- cargas: ordenação por data (paginação de Cargas/Programação) e status
CREATE INDEX IF NOT EXISTS idx_cargas_data ON public.cargas USING btree (data DESC);
CREATE INDEX IF NOT EXISTS idx_cargas_status ON public.cargas USING btree (status);
CREATE INDEX IF NOT EXISTS idx_cargas_created_by ON public.cargas USING btree (created_by);

-- etiquetas: busca por chave_acesso (scanner) e numero_nf (Conferência)
CREATE INDEX IF NOT EXISTS idx_etiquetas_chave_acesso ON public.etiquetas USING btree (chave_acesso);
CREATE INDEX IF NOT EXISTS idx_etiquetas_numero_nf ON public.etiquetas USING btree (numero_nf);
CREATE INDEX IF NOT EXISTS idx_etiquetas_carga_status ON public.etiquetas USING btree (carga_id, status);

-- ctes: lookup por nf_id e carga_id (Consulta NF e relatórios)
CREATE INDEX IF NOT EXISTS idx_ctes_nf_id ON public.ctes USING btree (nf_id);
CREATE INDEX IF NOT EXISTS idx_ctes_carga_id ON public.ctes USING btree (carga_id);

-- veiculo_nfs: lookup por nf_id (Consulta NF expedida) e veiculo_id
CREATE INDEX IF NOT EXISTS idx_veiculo_nfs_nf_id ON public.veiculo_nfs USING btree (nf_id);
CREATE INDEX IF NOT EXISTS idx_veiculo_nfs_veiculo_id ON public.veiculo_nfs USING btree (veiculo_id);

-- baixas_entrega: lookup por nf_id (Histórico) e veiculo_id
CREATE INDEX IF NOT EXISTS idx_baixas_entrega_nf_id ON public.baixas_entrega USING btree (nf_id);
CREATE INDEX IF NOT EXISTS idx_baixas_entrega_veiculo_id ON public.baixas_entrega USING btree (veiculo_id);

-- posicoes_gps: a tabela mais castigada (cresce a cada 30s por veículo)
-- Índice composto para buscas "última posição de uma rota"
CREATE INDEX IF NOT EXISTS idx_posicoes_gps_rota_tempo ON public.posicoes_gps USING btree (monitoramento_rota_id, registrado_em DESC);

-- monitoramento_paradas / rotas: filtros do mapa
CREATE INDEX IF NOT EXISTS idx_mon_paradas_rota_id ON public.monitoramento_paradas USING btree (monitoramento_rota_id);
CREATE INDEX IF NOT EXISTS idx_mon_paradas_status ON public.monitoramento_paradas USING btree (status);
CREATE INDEX IF NOT EXISTS idx_mon_rotas_data_status ON public.monitoramento_rotas USING btree (data DESC, status);
CREATE INDEX IF NOT EXISTS idx_mon_rotas_veiculo_id ON public.monitoramento_rotas USING btree (veiculo_id);

-- alertas_monitoramento: filtros do painel de alertas
CREATE INDEX IF NOT EXISTS idx_alertas_rota_lido ON public.alertas_monitoramento USING btree (monitoramento_rota_id, lido);

-- veiculos: lookup por access_code (login motorista) e data
CREATE INDEX IF NOT EXISTS idx_veiculos_access_code ON public.veiculos USING btree (access_code) WHERE access_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_veiculos_data ON public.veiculos USING btree (data DESC);
