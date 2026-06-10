## Objetivo
Implementar histórico completo de cada NF na Consulta de NF, com captura automática da chegada ao CD-RJ e event store unificado (`nf_eventos`) para servir de base a KPIs futuros.

## Etapa 0 — Botão "Histórico" na Consulta de NF
- Adicionar coluna de ação "Histórico" em cada linha de `ConsultaNF.tsx`.
- Criar `src/components/consulta/HistoricoNFDialog.tsx` (Dialog full-height) com timeline vertical (ícone + título + ator + timestamp + detalhe).
- Hook `src/hooks/useHistoricoNF.ts` que, por NF, lê em paralelo:
  - `notas_fiscais` (inclusão no sistema)
  - `agendamentos`
  - `nf_enderecamento`
  - `veiculo_nfs` + `veiculos` (expedição)
  - `etiquetas` (conferência interna/externa, divergência)
  - `monitoramento_paradas` (chegada cliente)
  - `baixas_entrega` (entrega/recusa/reentrega)
  - `ctes` (CT-e/Minuta vinculada)
- Sem leitura de `audit_log`.
- Ordena por timestamp ASC. Mostra ator (operador / motorista) quando disponível.

## Etapa 1 — Chegada no CD-RJ
- Trigger automático: ao inserir a 1ª etiqueta com `status='conferido_interno'` para uma NF, registra evento `chegada_cd` (fallback).
- Botão manual "Registrar chegada no CD" no Dialog de Histórico para quando ainda não houver bip — apenas admin/operador ativo. Idempotente (não duplica).
- Evento aparece automaticamente na timeline.

## Etapa 2 — Tabela `nf_eventos` + triggers retroativos
Schema (migration única, com GRANT + RLS):

```sql
CREATE TABLE public.nf_eventos (
  id uuid PK default gen_random_uuid(),
  nf_id uuid NOT NULL REFERENCES notas_fiscais(id) ON DELETE CASCADE,
  tipo text NOT NULL,            -- ver lista abaixo
  ocorrido_em timestamptz NOT NULL default now(),
  ator_id uuid REFERENCES auth.users(id),
  ator_nome text,
  payload jsonb NOT NULL default '{}',
  origem text NOT NULL,          -- 'trigger' | 'manual' | 'backfill'
  dedupe_key text UNIQUE,        -- evita duplicar evento da mesma fonte
  created_at timestamptz default now()
);
CREATE INDEX ON public.nf_eventos (nf_id, ocorrido_em);
CREATE INDEX ON public.nf_eventos (tipo);
```

Tipos: `nf_emitida`, `nf_incluida`, `agendada`, `enderecada`, `expedicao_veiculo`, `conferencia_interna`, `conferencia_externa`, `divergencia`, `chegada_cd`, `inicio_rota`, `chegada_cliente`, `entrega`, `recusa`, `reentrega`, `cte_vinculado`.

Triggers (todos `SECURITY DEFINER`, populam `nf_eventos`):
- `tg_nfev_nf_incluida` (AFTER INSERT notas_fiscais) → `nf_emitida` (data_emissao) + `nf_incluida` (created_at).
- `tg_nfev_agendamento` (AFTER INSERT/UPDATE agendamentos)
- `tg_nfev_enderecamento` (AFTER INSERT nf_enderecamento)
- `tg_nfev_veiculo_nf` (AFTER INSERT veiculo_nfs) → `expedicao_veiculo`
- `tg_nfev_etiqueta` (AFTER UPDATE etiquetas) → `conferencia_interna`, `conferencia_externa`, `divergencia`, e `chegada_cd` na 1ª `conferido_interno` da NF
- `tg_nfev_parada` (AFTER UPDATE monitoramento_paradas) → `chegada_cliente`
- `tg_nfev_baixa` (AFTER INSERT baixas_entrega) → `entrega`/`recusa`/`reentrega`
- `tg_nfev_cte` (AFTER INSERT ctes, casado por chave/numero) → `cte_vinculado`

`dedupe_key` exemplos: `agendamento:{agendamento_id}:{status}:{data}`, `etiqueta:{etiqueta_id}:{status}`, `chegada_cd:{nf_id}`, `baixa:{baixa_id}`.

Função `public.registrar_chegada_cd_manual(p_nf_id uuid)` (SECURITY DEFINER, exige `is_active_operator()`) → insere `chegada_cd` se ainda não existir.

Backfill (idempotente, parte da migration): popula `nf_eventos` a partir das tabelas existentes usando os mesmos `dedupe_key`. ON CONFLICT DO NOTHING.

## Etapa 3 — Hook lê de `nf_eventos`
Após Etapa 2, `useHistoricoNF` passa a ler 1 query: `select * from nf_eventos where nf_id=$1 order by ocorrido_em`. Mantém formatador de cada `tipo` para renderizar título/ícone.

## Detalhes técnicos
- RLS `nf_eventos`: SELECT para admin + operador ativo (mesma regra de `notas_fiscais`); INSERT só via trigger/RPC (sem policy de insert para `authenticated`); `service_role` ALL.
- Performance: a tabela cresce, mas leitura é sempre por `nf_id` (índice). Sem impacto na Consulta de NF (carrega só ao abrir o Dialog).
- Não tocar em: `calculateBoxes`, fluxo de conferência 2 etapas, `cargas.status`, parser XML Pandurata/Bauducco.
- Sem alterações em mobile, agendamento, roteirização, GPS, baixa, scanner.

## Ordem de execução
1. Migration: cria `nf_eventos` + triggers + RPC + backfill.
2. Após migration aprovada e tipos regenerados: cria `useHistoricoNF`, `HistoricoNFDialog`, botão na `ConsultaNF`.
3. Botão "Registrar chegada no CD" dentro do Dialog usa a RPC.

## Memória a salvar ao final
`mem://funcionalidades/historico-nf-eventos` — descrevendo a tabela `nf_eventos`, dedupe_key, lista de triggers e que a Consulta de NF consome via Dialog.
