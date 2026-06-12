---
name: XML Parser Pandurata/Bauducco nVol + CT-e volume
description: Regra de cubagem para XMLs Pandurata/Bauducco — nVol decimal=m³, inteiro=caixas, NUNCA cair em fallback. CT-e só aceita m³ quando cUnid="00".
type: feature
---

## Regra do XML da NF (Pandurata/Bauducco)

`<nVol>` tem dois usos:
- **Decimal** (ex: `3.918`, `39.935`) → cubagem real em m³ → usar como `volume_m3`
- **Inteiro** (ex: `1120`, `300`) → quantidade de caixas → **IGNORAR**

Para Pandurata, se `<nVol>` decimal não rolar, **retornar 0**. NUNCA cair no fallback `parseM3FromText`: ele acha "M3" em descrição de item (`<infAdProd>`, `<infCpl>`) e captura o número adiante (geralmente nVol/qVol).

Aplicado em:
- `src/lib/xml-parser.ts` → `extractVolumeM3`, bloco `if (isPandurata)` retorna 0 ao final
- `src/lib/xml-volume-parser.ts` → `extractVolumeM3`, bloco `if (isPandurataXml)` retorna 0 ao final

## Regra do CT-e (`src/lib/cte-parser.ts`)

`ImportarCteDialog` SOBRESCREVE `volume_m3` de NFs Pandurata/Docile com o valor que o `cte-parser` extrai. Por isso o parser do CT-e tem que ser conservador:

- **APENAS** aceitar `<infQ><qCarga>` quando `<cUnid>` = `"00"` (M3).
- NUNCA aceitar por `tpMed` (regex em "VOLUME" casa "VOLUMES" com `cUnid="03"` = unidades → bug 12/06/2026 contaminou 232 NFs com volumes tipo 191/4137).
- NUNCA usar fallback genérico em tags `<vol>`, `<volume>`, `<cubagem>` etc — vira o mesmo bug.
- Se CT-e não declarar M3 explícito → `volumeM3 = 0` (operador atualiza via Excel/TXT/dialog).

## Detecção de Pandurata
Regex `/pandur(?:ata)?/i` em: `emitente`, `<xMarca>`, `<marca>`, `<xNome>`. Bauducco usa razão "Pandurata Alimentos Ltda".

## Limpeza recorrente
Quando o bug é detectado, rodar:
```sql
UPDATE notas_fiscais SET volume_m3 = 0
WHERE razao_social_emitente ILIKE '%pandur%'
  AND volume_m3 > 0 AND volume_m3 = FLOOR(volume_m3);
```
(Inteiro em Pandurata = sintoma do bug; cubagem real é sempre decimal.)
