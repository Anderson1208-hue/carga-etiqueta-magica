---
name: Pandurata (Bauducco) — Isenção ICMS Decreto MG 46.266/2013
description: CT-es de MG->RJ da Pandurata saem com CST 41 (não tributada) + CFOP 6932 e infAdFisco citando Decreto 46.266/2013. Simulador NÃO deve calcular ICMS.
type: feature
---

# Pandurata — Isenção de ICMS (convênio MG)

CT-es do emitente **Expresso Ebenezer** (CNPJ 31.598.974/0001-42) para o
remetente **Pandurata Alimentos LTDA (Bauducco)** — CNPJ raiz `70940994` —
originados em **Extrema/MG (cMunIni=3125101)** com destino RJ saem **isentos
de ICMS** por convênio estadual de MG.

## Assinatura fiscal no XML do CT-e

- `<CFOP>6932</CFOP>` (transporte iniciado em UF diversa da do tomador)
- `<ICMS><ICMS45><CST>41</CST></ICMS45></ICMS>` (41 = não tributada)
  - CT-es antigos usam `<ICMSOutraUF>` com CST 90 e vICMS 0.00 — mesmo efeito.
- `<infAdic><infAdFisco>Mensagem de ICMS: Isenção de icms conforme
  Decreto 46.266 de junho de 2013.</infAdFisco></infAdic>`

## Componentes do vPrest observados

Sempre 5 componentes na tabela vigente:

| xNome | Origem |
|---|---|
| FRETE PESO | tarifa/ton × peso cubado |
| FRETE VALOR | ad valorem sobre vNF |
| CAT | fixo R$ 5,00 (Ad. CT-e) |
| PEDAGIO | R$/100kg conforme tabela RJ/Interior |
| OUTROS | GRIS |

`vTPrest == vRec` (sem retenção porque CST=41).

## Regra no simulador fiscal

1. Detectar Pandurata pelo CNPJ raiz `70940994` **ou** por
   `cMunIni=3125101` (Extrema/MG) do emitente-transportador Ebenezer.
2. Aplicar **CST 41**, `vBC=0`, `vICMS=0`, `pICMS=0`.
3. Emitir `<infAdFisco>` com o texto padrão do Decreto 46.266/2013.
4. Usar CFOP 6932 quando origem MG e tomador não-MG.
5. NÃO embutir ICMS no cálculo do frete — o vTPrest é o próprio valor
   negociado (tabela Pandurata já não considera ICMS).

## Referência

Decreto MG nº 46.266/2013 — isenção de ICMS na prestação de serviço de
transporte de cargas com início em MG destinadas a contribuinte de outro
Estado, dentro das hipóteses do convênio.
