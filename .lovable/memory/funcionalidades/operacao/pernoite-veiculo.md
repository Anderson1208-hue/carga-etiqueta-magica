---
name: pernoite-veiculo
description: Botão Pernoite em Prestação de Contas replica o veículo (com suas NFs) para o próximo dia, destacado em azul na Roteirização.
type: feature
---
# Pernoite de Veículo

## Fluxo
- Botão **Pernoite** em `PrestacaoContas.tsx` (lado de Encerrar), ícone `Moon`, borda azul.
- Ao clicar:
  1. Calcula próximo dia (`veiculo.data + 1`).
  2. Busca `veiculo_nfs` (com `carga_origem_id`) do veículo original.
  3. `INSERT` em `veiculos` com mesma placa/motorista, `data=proxDia`, `pernoite=true`, `pernoite_origem_id=<id original>`, `status='pendente'`.
  4. Copia todos os vínculos `veiculo_nfs` (preservando `carga_origem_id`) para o novo veículo.
  5. Encerra prestação do veículo original com `obs` prefixada `[PERNOITE]`.

## Banco
- `veiculos.pernoite boolean default false` + `veiculos.pernoite_origem_id uuid`.
- Índice parcial `idx_veiculos_pernoite` em `pernoite=true`.
- (Colunas `notas_fiscais.pernoite/pernoite_em` existem mas NÃO são usadas neste fluxo — mantidas por histórico.)

## Destaque UI
- `Roteirizacao.tsx` aba **Veículos**: lê `pernoite` no select; aplica `border-blue-500 border-2 bg-blue-50/50` no Card e badge azul "PERNOITE" ao lado da placa.
- Preparação (`Programacao.tsx`) NÃO destaca pernoite — as NFs continuam vinculadas ao novo veículo, então não aparecem como liberadas.

## Acesso do motorista após pernoite
- O novo veículo do pernoite recebe **outro `access_code`**, mas o motorista continua usando o código antigo.
- `supabase/functions/motorista-acesso` resolve a **cadeia de sucessores** (`pernoite_origem_id`, até 10 níveis) e retorna sempre o último veículo — assim as NFs (e a baixa) continuam disponíveis no app com o código original.
