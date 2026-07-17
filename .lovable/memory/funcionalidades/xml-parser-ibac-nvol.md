---
name: xml-parser-ibac-nvol
description: IBAC — nunca ler m³ do XML; cubagem entra sempre via planilha
type: feature
---

# IBAC: m³ NUNCA vem do XML

O layout do IBAC (CNPJ raiz `61472205`, razão "IBAC INDUSTRIA BRASILEIRA
DE ALIMENTOS E CHOCOLATES LTDA") não traz cubagem confiável no XML:
`<vol><nVol>` é quantidade de volumes (e às vezes traz números absurdos como
8683) e o fallback de texto livre captura falsos positivos.

**Regra (parsers `src/lib/xml-parser.ts` + `src/lib/xml-volume-parser.ts`):**

- Detectar IBAC por CNPJ raiz `61472205` OU por `xNome`/`xFant`/`marca`
  contendo a palavra `IBAC`.
- Retornar `volume_m3 = 0` — não usar `<nVol>`, não cair em fallback de
  texto livre, não somar `<infAdProd>`.
- Cubagem correta é lançada via planilha (dialog "Atualizar m³ Excel/TXT").

**Vigência:** a partir de **06/07/2026**. Cargas anteriores não foram
reprocessadas. Ao rodar reimportação ou script de correção retroativa,
respeitar esse corte (não sobrescrever dados de cargas antigas).

**NÃO confundir com Pandurata:** para Pandurata `<nVol>` é sempre m³
(ver [mem://funcionalidades/xml-parser-pandurata-nvol]). São regras
opostas por emitente.
