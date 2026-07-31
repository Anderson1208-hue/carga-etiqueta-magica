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
