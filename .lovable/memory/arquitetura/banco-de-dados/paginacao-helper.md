---
name: Helper de paginação Supabase
description: src/lib/supabase-pagination.ts com fetchAllPages e fetchInChunks. Padrão obrigatório para queries em tabelas que crescem (notas_fiscais, baixas_entrega, monitoramento_*, etc.).
type: feature
---

## Helper
`src/lib/supabase-pagination.ts` exporta:
- `fetchAllPages(buildQuery, pageSize=1000)` — pagina por `.range()` até esgotar. Query DEVE ter `.order()`.
- `fetchInChunks(ids, fetcher, chunkSize=200)` — chunk de ids para `.in()`.

## Aplicado em (Fase A.1)
- TorreControle (rotas + alertas)
- MonitoramentoRotas (rotas, paradas, alertas)
- HistoricoEntregas (baixas + nfs/veiculos/profiles em chunks)
- Roteirizacao (loadCargas, loadEntregas, loadVeiculos.vnfs)
- Cargas (handlePrintNotaCarga)
- Romaneio (loadDataForCarga)

## Regra
Sempre que adicionar nova query em tabela do tier "crescente" (notas_fiscais, baixas_entrega, etiquetas, veiculo_nfs, agendamentos, ctes, monitoramento_*, alertas, audit_log), usar fetchAllPages OU `.limit()` explícito. Nunca confiar no default 1000.
