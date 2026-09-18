---
name: Cubagem automática a partir do cadastro de produtos
description: Triggers que preenchem volume_m3/peso_bruto das NFs pelo cadastro de produtos; exceções Pandurata, IBAC, IBAE e Docile.
type: feature
---
Desde 18/09/2026 a cubagem entra automaticamente, sem depender do botão "Aplicar nas NFs":

- `tg_nf_cubagem_por_cadastro` em `itens_nf` (AFTER INSERT/UPDATE de `q_com`, `c_prod`):
  calcula `volume_m3 = Σ(q_com × produtos.volume_m3)` e, se `peso_bruto` estiver vazio,
  `peso_bruto = Σ(q_com × peso_bruto_cx_kg)`.
- `tg_produto_recalcula_cubagem_nfs` em `produtos` (AFTER INSERT/UPDATE de `volume_m3`,
  `peso_bruto_cx_kg`): recalcula NFs dos últimos 45 dias daquele embarcador que estavam com
  m³ = 0 — cobre o caso do produto cadastrado depois da importação da NF.

Regras mantidas: match por CNPJ + `ltrim(codigo,'0')`; só grava quando **todos** os itens da NF
têm produto com m³; nunca sobrescreve peso já existente.

Exceções (raízes de CNPJ ignoradas pelos triggers — m³ vem do XML ou de planilha/NOTFIS):
`70940994` Pandurata/Bauducco, `61472205` IBAC, `42431457` IBAE, `94261534` Docile.
Novo embarcador com cubagem por arquivo = incluir a raiz nas duas funções.
