---
name: Índices de performance
description: Índices criados na Fase D para queries frequentes. Antes de criar query nova, verificar se a coluna filtrada/ordenada tem índice.
type: feature
---

## Índices criados (Fase D)

| Tabela | Índice | Motivo |
|---|---|---|
| roteirizacao_paradas | (roteirizacao_id) | `.in("roteirizacao_id", ...)` em Roteirizacao |
| baixas_entrega | (status), (registrado_em DESC) | filtro `status=entregue` + ordenação Histórico |
| agendamentos | (status), (created_at DESC) | filtros + ordenação Agendamento |
| monitoramento_paradas | (rota_id, ordem) | edge function processar-gps |
| carga_operadores | (carga_id, operador_id), (operador_id) | RLS `is_carga_operator()` |
| veiculos | (status), (created_by) | filtros pendente/em_rota + RLS |
| ctes | (chave_nf_referenciada) | PDF Nota de Carga |
| profiles | (id, ativo) | `is_active_operator()` |

## Já existentes (não recriar)

- **etiquetas:** `carga_id`, `nf_id`, `numero_nf`, `qr_payload`, `chave_acesso`, `status`, composto `(carga_id, status)`, único `(carga_id, nf_id, c_prod, seq)`.
- **notas_fiscais:** `carga_id`, `cnpj_destinatario`, `numero_nf`, `status_entrega`, `data_emissao DESC`, `created_at DESC`, único `chave_acesso`.
- **veiculo_nfs:** `nf_id` (único), `veiculo_id`.
- **posicoes_gps:** composto `(rota_id, registrado_em DESC)`.
- **monitoramento_rotas:** `(data DESC, status)`, `veiculo_id`.
- **alertas_monitoramento:** `(rota_id, lido)`.
- **cargas:** `data DESC`, `status`, `created_by`, `operador_responsavel`.
- **itens_nf:** `nf_id`, `c_prod`.
- **nf_enderecamento:** `nf_id`, único `(nf_id, lower(btrim(posicao)))`.

## Regra
Antes de adicionar `.eq()`, `.in()` ou `.order()` em coluna nova, conferir esta lista. Se a coluna não tem índice e a tabela tem >1000 linhas, criar índice via migration antes de fazer deploy.
