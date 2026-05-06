---
name: Helper de paginação Supabase
description: src/lib/supabase-pagination.ts com fetchAllPages e fetchInChunks. Padrão obrigatório para queries em tabelas que crescem (notas_fiscais, baixas_entrega, monitoramento_*, etc.).
type: feature
---

## Helper
`src/lib/supabase-pagination.ts` exporta:
- `fetchAllPages(buildQuery, pageSize=1000)` — pagina por `.range()` até esgotar. Query DEVE ter `.order()`.
- `fetchInChunks(ids, fetcher, chunkSize=200)` — chunk de ids para `.in()`.

## Tier 1 — fetchAllPages (Fase A.1)
Tabelas crescentes sem teto previsível:
- TorreControle (rotas + alertas)
- MonitoramentoRotas (rotas, paradas, alertas)
- HistoricoEntregas (baixas + nfs/veiculos/profiles em chunks)
- Roteirizacao (loadCargas, loadEntregas, loadVeiculos.vnfs)
- Cargas (handlePrintNotaCarga)
- Romaneio (loadDataForCarga)

## Tier 2 — `.limit(2000)` defensivo (Fase A.2)
Queries com escopo limitado (1 veiculo_id, 1 carga_id, ou `.in(nfIds)` médio) onde 2000 cobre o pior cenário real com folga 2x:
- Agendamento (loadAgendamentos: nfs/cargas/ctes; handleSearch: cargas/agendamentos/ctes)
- ConferenciaExterna (loadNfsForVeiculo: vnfs, nfs, baixas)
- BaixaEntrega (loadNfs e handleDownloadOffline: vnfs, nfs, baixas)
- Roteirizacao (loadVeiculoNfs, handleGerarResumoDia, handleGerarResumoVeiculo, handleGerarNotaDeCarga: vnfs/ctes/agendamentos; PDF resumo: nfs/ctes)
- processar-gps edge (paradas por rota)

## Tier 3 — sem mudança (Fase A.3)
Queries onde o resultado é naturalmente pequeno e o limite de 1000 é inalcançável:
- `.maybeSingle()` / `.single()` — sempre 1 linha
- `count: "exact", head: true` — só conta
- `.eq("id", umId)` ou `.in("id", [poucosIds])` — bounded
- `monitoramento_config` (única linha global)
- `cargas` filtrada por id único
- ConferenciaInterna scans 1-a-1 (`.eq("qr_payload")` + `.maybeSingle()`)

## Regra obrigatória
Toda nova query em tabela "crescente" (notas_fiscais, baixas_entrega, etiquetas, veiculo_nfs, agendamentos, ctes, monitoramento_*, alertas_monitoramento, audit_log, posicoes_gps, nf_enderecamento, roteirizacao_paradas):
1. Resultado pode ser >1000? → `fetchAllPages` com `.order()` determinístico.
2. Bounded por escopo (1 veículo / 1 carga / IDs médios)? → `.limit(2000)` explícito.
3. Sempre 1 linha? → `.maybeSingle()` / `.single()`.

Nunca confiar no default 1000 do PostgREST.
