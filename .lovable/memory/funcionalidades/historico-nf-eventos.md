---
name: Histórico de NF (nf_eventos)
description: Event store nf_eventos centraliza ciclo de vida da NF (emissão → entrega). Lido pelo botão "Histórico" na Consulta de NF. Triggers em notas_fiscais/agendamentos/etiquetas/veiculo_nfs/baixas/ctes/paradas/enderecamento populam automaticamente. Chegada no CD via fallback (1º bip interno) ou RPC manual.
type: feature
---

## Tabela `public.nf_eventos`
Colunas: `id`, `nf_id` (FK CASCADE), `tipo`, `ocorrido_em`, `ator_id`, `ator_nome`, `payload jsonb`, `origem` (`trigger`/`manual`/`backfill`), `dedupe_key UNIQUE`, `created_at`.

Tipos: `nf_emitida`, `nf_incluida`, `agendada`, `enderecada`, `expedicao_veiculo`, `conferencia_interna`, `conferencia_externa`, `divergencia`, `chegada_cd`, `inicio_rota`, `chegada_cliente`, `entrega`, `recusa`, `reentrega`, `cte_vinculado`.

Índices: `(nf_id, ocorrido_em)`, `(tipo)`.

## RLS
- SELECT: `is_admin() OR is_active_operator()`.
- INSERT/UPDATE/DELETE: nenhuma policy. Só `SECURITY DEFINER` (triggers) e `service_role` escrevem.

## Dedupe keys (não duplicar evento da mesma fonte)
- `nf_emitida:{nf_id}`, `nf_incluida:{nf_id}`
- `agendamento:{agendamento_id}:{status}:{data}`
- `enderecamento:{nf_enderecamento_id}`
- `vnf:{veiculo_nfs_id}`
- `etq_interna:{etiqueta_id}`, `etq_externa:{etiqueta_id}`, `etq_diverg:{etiqueta_id}`
- `chegada_cd:{nf_id}` (único — fallback ou manual sobrescreve por ON CONFLICT DO NOTHING)
- `parada:{parada_id}:{nf_id}`
- `baixa:{baixa_id}`
- `cte:{cte_id}:{nf_id}`

## Triggers AFTER (todos SECURITY DEFINER, `tg_nfev_*`)
`notas_fiscais` INSERT, `agendamentos` INSERT/UPDATE, `nf_enderecamento` INSERT, `veiculo_nfs` INSERT, `etiquetas` UPDATE (status), `monitoramento_paradas` UPDATE (chegou_cliente/finalizada — casa NFs por CNPJ+veículo), `baixas_entrega` INSERT, `ctes` INSERT.

## Chegada no CD
- Automático: 1º bip `conferido_interno` da NF cria evento `chegada_cd` (dedupe garante uma única).
- Manual: RPC `registrar_chegada_cd_manual(p_nf_id uuid, p_observacao text)` exige `is_admin OR is_active_operator`. Idempotente.

## UI
- `src/components/consulta/HistoricoNFDialog.tsx`: timeline vertical com ícone/cor por tipo, ator, timestamp, payload formatado.
- `ConsultaNF.tsx`: botão `History` em cada linha da tabela e no header do detalhe.
- Lê `nf_eventos` via `(supabase as any).from("nf_eventos")` (tipos ainda não regenerados).

## Não inclui
- `audit_log` (decisão explícita: histórico operacional, não auditoria genérica).
