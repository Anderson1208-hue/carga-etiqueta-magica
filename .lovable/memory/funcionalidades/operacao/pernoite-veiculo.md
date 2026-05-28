---
name: pernoite-veiculo
description: Botão Pernoite em Prestação de Contas libera NFs do veículo para o próximo dia, destacadas em azul na Preparação.
type: feature
---
# Pernoite de Veículo

## Fluxo
- Botão **Pernoite** em `PrestacaoContas.tsx` (lado de Encerrar), ícone `Moon`, borda azul.
- Ao clicar: confirma, busca TODAS as `veiculo_nfs` do veículo (independente de status/baixa), e:
  1. `UPDATE notas_fiscais SET pernoite=true, pernoite_em=now(), status_entrega='CARGA NO DEPOSITO' WHERE id IN (nf_ids)`
  2. `DELETE FROM veiculo_nfs WHERE veiculo_id = X` (libera para Preparação)
  3. Encerra prestação com obs prefixada `[PERNOITE]`.

## Banco
- Coluna `notas_fiscais.pernoite boolean default false` + `pernoite_em timestamptz`.
- Índice parcial `idx_nf_pernoite` em `pernoite=true`.

## Destaque UI
- `Programacao.tsx` lê `pernoite` no select de NFs. Linha da NF com `bg-blue-50` + `border-l-4 border-blue-500` + badge "PERNOITE" azul.
- Precedência de destaque: pernoite > agendada > selecionada.
