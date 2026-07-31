---
name: Cadastro Mestre de Produtos
description: Tabela produtos (por embarcador) com dimensões, cubagem, paletização e regras de armazenagem; import de planilha Masterdata via RPC importar_produtos_lote
type: feature
---

# Produtos (Fase 2 Cadastros)

Tela `/produtos` (grupo Cadastros). Chave única = `cnpj_embarcador` + `codigo` (cProd),
permitindo mesmo SKU em embarcadores diferentes.

## Blocos de dados
- **Identificação:** embarcador, codigo (cProd), codigo_alternativo (ZREP/FERT), descricao,
  unidade, marca, segmento, categoria, hierarquia, EAN TDU/MCU/RSU, DUN-14.
- **Logística:** qtd_rsu_por_tdu (un/caixa), qtd_mcu_por_tdu, pesos bruto/líquido da caixa,
  dimensões L/C/A em **mm**, `volume_m3`.
- **Armazenagem:** lastro, camadas (LAY), caixas_por_pallet (PLB), tipo_pallet, altura/peso do
  pallet, empilhamento_max, regra_giro (FEFO default), faixa_temperatura, shelf life total +
  mínimo no recebimento (At Risk) e na expedição (Aged), temperaturas, frágil, empilhável.
- **Fiscal/risco:** NCM, CEST, ONU, classe de risco, produto perigoso, sensível a furto.

## Automações (trigger `fn_produtos_calc_volume`)
- Se `volume_m3` vazio e L/C/A preenchidos → calcula m³ e marca `volume_calculado = true`
  (UI mostra em âmbar).
- Se `caixas_por_pallet` vazio e lastro×camadas existem → calcula.

## Importação de planilha
`importar_produtos_lote(payload jsonb)` — upsert idempotente por (cnpj_embarcador, codigo),
lotes de 200 no front. Parser em `src/components/produtos/ImportarProdutosDialog.tsx`
reconhece o layout **Masterdata** (Mars): Produto, Descrição, EAN TDU/MCU/RSU, MCU/TDU,
RSU/TDU, Peso Bruto/Líq. CX, L/C/A (mm), Volume m3, Lastro, Altura (LAY), CDA/Pallet (PLB),
NCM, Validade, At Risk, Aged.

## Uso futuro
Fonte de cubagem/peso para NFs sem informação adicional no XML (casar `itens_nf.c_prod` com
`produtos.codigo` + CNPJ do emitente) e base para WMS (endereçamento por pallet, FEFO).

## Cadastro na Chegada (`/produtos/chegada`)
Fila de captura manual: RPC `produtos_pendentes_cadastro(p_dias, p_cnpj)` lista `c_prod` que já
apareceram em `itens_nf` e **não existem** em `produtos` (match por CNPJ do emitente + código),
com ocorrências e última data. Operador captura no recebimento (dimensões, peso, lastro/camadas,
EAN, shelf life) e salva com `origem_cadastro='chegada_manual'`.

## Cubagem automática nas NFs
RPC `aplicar_cubagem_produtos_nf(p_dias, p_simular)` — para NFs com `volume_m3 = 0`:
`volume_m3 = Σ(itens_nf.q_com × produtos.volume_m3)` e `peso_bruto = Σ(q_com × peso_bruto_cx_kg)`.
Regra 1 un = 1 caixa (q_com = caixas). **Só grava quando TODOS os itens da NF têm produto
cadastrado** — meia cubagem é pior que nenhuma. Nunca sobrescreve peso já existente.

## Carga inicial feita (31/07/2026)
- Mars (CNPJ 29737368003487) — 83 SKUs da planilha Masterdata, cadastro completo.
- Bauducco/Pandurata (CNPJ 70940994008277) — 150 SKUs (dimensões da planilha em **cm**,
  convertidas ×10 para mm); só os códigos já vistos em NFs, o restante da planilha (7.380 linhas)
  entra por demanda.
- Pendentes de cadastro concentrados em IBAC, Docile, Arcor, Bagley, Hershey.
