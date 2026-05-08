---
name: Status Carga Manual
description: cargas.status é manual; 'fechada' = estado inicial (NFs apenas cadastradas, não liberadas); 'aberta' = liberada para Preparação. Só Cargas.tsx escreve.
type: constraint
---

# Regras de `cargas.status`

- Default no banco: **`fechada`**. Toda nova carga importada nasce fechada.
- **`fechada`** = NFs apenas cadastradas no sistema. Não aparecem em Preparação.
- **`aberta`** = carga liberada. NFs entram no fluxo (Preparação → Roteirização → etc).
- Apenas o módulo **Cargas** (`src/pages/Cargas.tsx`) pode alterar o status. Nenhum outro módulo (Conferência, Baixa, Roteirização, etc.) deve modificar.
- Bloqueios atualmente ativos por `status='fechada'`:
  - **Preparação** (`Programacao.tsx`): filtra `cargas.status='aberta'` no carregamento de NFs disponíveis.
- Roteirização, Etiquetas e Conferência **não** bloqueiam por status (apenas Preparação, conforme decisão do usuário em mai/2026).

**Por que:** carga fechada representa o processo inicial pós-importação. Operador precisa revisar e abrir manualmente para liberar ao fluxo.
