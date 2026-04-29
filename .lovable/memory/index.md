---
name: index
description: Project memory index
type: reference
---
# Project Memory

## Core
- **Dates:** Append `T00:00:00` to all date strings before processing to prevent UTC timezone shifts.
- **UI & Formats:** Natural sorting for NF, cProd, CEP, CNPJ. Strip leading zeros from `cProd` in UI (keep in DB/QR). Highlight "CHOCOLATE" loads in red.
- **Performance:** Clean up photo URLs with `URL.revokeObjectURL` on mobile. Use batch limits, pauses, and deterministic ordering for large queries.
- **Routing:** Mobile devices (<768px) are forced to operational routes (`/conferencia-interna`, `/conferencia-externa`, `/baixa-entrega`, `/login`).
- **Core Logic:** Never modify the `calculateBoxes` logic (1 un = 1 box) or the 2-stage conference flow (Interna = Galpão, Externa = Motorista).
- **Dias úteis:** Liberação de agendamentos usa próximo dia útil RJ (exclui sáb/dom + feriados nacionais/estaduais) via `src/lib/feriados-rj.ts`.

## Memories
- [Contagem de Caixas](mem://logica/contagem-caixas) — 1 un = 1 caixa. Centralized logic, grouped by cProd.
- [Importação XML Duplicada](mem://logica/importacao-xml-duplicado) — Idempotent RPC import via import_batch_id.
- [XML Parser](mem://funcionalidades/xml-parser) — Weights extracted from <transp><vol> (header level).
- [Importação de CT-e](mem://funcionalidades/operacao/importacao-cte) — Parse and link CT-e to Carga and NF.
- [Documentos Transporte CTE+Minuta](mem://funcionalidades/operacao/documentos-transporte-cte-minuta) — Tabela ctes genérica: tipo_documento (CTE/MINUTA), MIN-{cnpj}-{num} para minuta sem chave, vínculo NF por chave→número.
- [Importação de Cubagem](mem://funcionalidades/operacao/importacao-cubagem-excel) — Excel m3 import via regex.
- [Ordenação Numérica](mem://logica/ordenacao-numerica-real) — Natural sorting logic.
- [Filtros de Disponibilidade](mem://logica/preparacao/filtros-disponibilidade) — NF visibility rules in Preparação.
- [Fluxo Prep/Roteirização](mem://arquitetura/fluxo-logistico-preparacao-e-roteirizacao) — Planning (volume/peso) to Execution (placa/seq).
- [Integração Prep/Rot](mem://arquitetura/integracao-preparacao-roteirizacao) — Passing NF payload via location.state.
- [Múltiplas Cargas Rota](mem://arquitetura/banco-de-dados/roteirizacao/multi-carga-vinculo) — Routes use primary carga_id as reference.
- [Clustering Geográfico](mem://logica/roteirizacao/clustering-geografico) — Haversine clustering (6km urban / 17km interior).
- [Roteirização Manual](mem://funcionalidades/roteirizacao/modo-manual) — Botão alternativo na Preparação: drag-and-drop + Haversine, sem OSRM.
- [Geocodificação RJ](mem://logica/geocodificacao-fallback-estratetiga) — Fallback chain: BrasilAPI CEP -> Bairro -> Logradouro.
- [Coordenadas do CD](mem://arquitetura/banco-de-dados/coordenadas-cd-central) — Fixed coordinates (-22.8783, -43.3367).
- [Conferência 2 Etapas](mem://arquitetura/fluxo-conferencia-duas-etapas) — Workflow for Galpão (Interna) vs Motorista (Externa).
- [Conferência Externa](mem://funcionalidades/operacao/conferencia-externa-mobile) — Motorista app requirements and validation.
- [Conferência Interna](mem://funcionalidades/operacao/conferencia-interna-mobile) — Galpão direct search and label scanning.
- [Conferência Offline](mem://funcionalidades/operacao/conferencia-interna-offline) — IndexedDB caching for no-signal areas.
- [Baixa de Entrega](mem://funcionalidades/operacao/baixa-de-entrega) — Mobile POD, multiple photos, GPS.
- [Scanner Híbrido](mem://arquitetura/operacao/scanner-offline-hibrido) — Mobile scanner tuning (BarcodeDetector, 60% crop, display:none).
- [Operação Geofence](mem://funcionalidades/monitoramento/operacao-e-geofence) — Automated geofence statuses.
- [GPS Híbrido](mem://arquitetura/monitoramento/gps-tracking-hibrido) — PWA <-> Edge Function background sync.
- [Smart GPS Tracking](mem://arquitetura/monitoramento/smart-gps-tracking-logic) — Dynamic ping rates (60s/30s) based on distance.
- [Constraints GPS PWA](mem://constraints/monitoramento-gps-pwa) — Tab must remain active for iOS/Android tracking.
- [Mapa Leaflet UI](mem://funcionalidades/monitoramento/visualizacao-mapa-leaflet) — Map visuals, tokens, truck icon.
- [Acesso Motorista](mem://arquitetura/banco-de-dados/veiculo-acesso-codigo-motorista) — 6-char public route access code.
- [Status de Entrega](mem://logica/ciclo-de-vida-status-entrega) — Delivery lifecycle trigger points.
- [Agendamento Regras](mem://funcionalidades/transporte/agendamento) — Schedule rules (releases day before).
- [Feriados RJ Dias Úteis](mem://funcionalidades/transporte/feriados-rj-dias-uteis) — Liberação considera próximo dia útil RJ (sáb/dom + feriados).
- [Agendamento Auto](mem://logica/agendamento/automacao-cnpj) — Specific CNPJs flagged automatically via triggers.
- [Agendamento Auto CNPJ+Emitente](mem://funcionalidades/transporte/agendamento-automatico-cnpj-emitente) — Match por par CNPJ destinatário + razão social do emitente (LIKE). emitente NULL = wildcard.
- [Reentrega libera veículo](mem://logica/reentrega-libera-veiculo) — REENTREGA (Baixa ou Agendamento) sempre apaga veiculo_nfs e reseta status_entrega para CARGA NO DEPOSITO.
- [Integração ERP Praxio](mem://arquitetura/integracao-erp/praxio-globus) — Status/occurrence push queue to Globus ERP.
- [QR Code Etiquetas](mem://especificacoes/etiquetas-qr-code) — Payload structure for labels.
- [Ordenação Etiquetas](mem://funcionalidades/pdf/etiquetas-ordenacao-operacional) — Hierarchical grouping for label printing.
- [Layout Zebra](mem://funcionalidades/pdf/etiquetas-configuracao-impressao-zebra-final) — PDF parameters for Zebra ZD220 labels.
- [Nota de Carga](mem://funcionalidades/pdf/nota-de-carga) — PDF generation and groupings.
- [Endereçamento NF no CD](mem://funcionalidades/operacao/enderecamento-nf-cd) — Múltiplas posições por NF; aparecem com a MR no header do PDF Nota de Carga.
- [Romaneio Totalizado](mem://funcionalidades/pdf/romaneio-totalizado) — Landscape PDF formatting requirements.
- [Validação Importação](mem://seguranca/validacao-importacao) — Rules for Chaves, CNPJ, Placas.
- [Busca Lote e Sync](mem://arquitetura/banco-de-dados/estrategia-de-busca-em-lote) — Deterministic pagination, RPC for massive aggregations.
- [Gestão Acesso RLS](mem://seguranca/gestao-de-acesso-operadores) — is_active_operator() and manual approval block.
- [Rastreabilidade Tags](mem://arquitetura/banco-de-dados/status-etiqueta-rastreabilidade) — Lifecycle tracking and divergence block info.
- [Estabilidade Frontend](mem://arquitetura/resiliencia-e-estabilidade) — QueryClient retry, staleTime, try/catch patterns.
- [Mapeamento Regiões RJ](mem://configuracao/macro-regioes-mapeamento-rj) — Neighborhood -> Macro Region logic map.
- [Selo Chocolate](mem://funcionalidades/operacao/classificacao-carga-sensivel-chocolate) — Visual highlights for sensitive chocolate loads.
- [Offline Data Sync](mem://performance/offline-data-sync-lote) — IndexedDB bulk import pauses/tuning.
- [Gestão RAM Fotos](mem://performance/gestao-memoria-fotos-mobile-v2) — revokeObjectURL for image previews.
- [Normalização Datas](mem://logica/normalizacao-datas-timezone-v2) — Fix for timezone shifting.
- [Navegação Mobile](mem://funcionalidades/ui/navegacao-mobile-operacional) — Bottom nav behavior.
- [Acesso Mobile Restrito](mem://constraints/acesso-mobile-restrito) — Routing constraints by screen size.
- [Exibição Cód Produto](mem://funcionalidades/pdf/exibicao-codigo-produto) — Presentation of cProd in UI/PDFs.
