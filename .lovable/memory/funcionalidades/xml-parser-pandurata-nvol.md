---
name: XML Parser Pandurata/Bauducco nVol
description: Regra de cubagem para XMLs Pandurata/Bauducco — nVol decimal=m³, inteiro=caixas, e NUNCA cair em fallback de texto
type: feature
---

## Regra

No XML da Pandurata/Bauducco (mesmo emitente), a tag `<nVol>` tem dois usos:

- **Decimal** (ex: `3.918`, `39.935`, `0.494`) → cubagem real em m³ → usar como `volume_m3`
- **Inteiro** (ex: `1120`, `300`, `216`) → quantidade de caixas (uso padrão NF-e) → **IGNORAR**

## Blindagem extra (29/05/2026)

Para Pandurata, se `<nVol>` decimal não rolar, **retornar 0 imediatamente**. NUNCA cair no fallback `parseM3FromText` que varre `xmlDoc.documentElement.textContent`: esse fallback acha "M3" em descrição de item (`<infAdProd>`, `<infCpl>`) e captura o próximo número adiante, que costuma ser a quantidade de caixas (`nVol`/`qVol`) — bug que causou NF 740159 sair com m³=216.

## Onde aplicar

- `src/lib/xml-parser.ts` → função `extractVolumeM3`, bloco `if (isPandurata)` retorna 0 ao final
- `src/lib/xml-volume-parser.ts` → função `extractVolumeM3`, bloco `if (isPandurataXml)` retorna 0 ao final

## Detecção de Pandurata

Regex `/pandur(?:ata)?/i` em: `emitente`, `<xMarca>`, `<marca>`, `<xNome>`. Bauducco usa razão social "Pandurata Alimentos Ltda".

## Quando entra 0

Quando entra 0, operador atualiza m³ pelo dialog "Atualizar m³ via XML", Excel de cubagem, ou TXT Docile.
