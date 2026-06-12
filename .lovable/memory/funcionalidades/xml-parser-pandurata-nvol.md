---
name: xml-parser-pandurata-nvol
description: Pandurata — <vol><nVol> é SEMPRE a cubagem m³ no XML, posição fixa no layout do emissor
type: feature
---

# Pandurata: `<nVol>` é sempre cubagem m³

No layout de NF-e da Pandurata, a tag `<transp><vol><nVol>` **sempre** contém a
cubagem (m³), na MESMA posição do XML. Não importa se o valor é inteiro ou
decimal — é sempre m³.

**Regra (parsers `src/lib/xml-parser.ts` + `src/lib/xml-volume-parser.ts`):**

- Detectar emitente Pandurata (por `xNome`, `xFant` ou `<marca>PANDUR…`).
- Ler `<vol><nVol>` e usar como `volume_m3` direto, sem filtro de
  inteiro/decimal.
- NUNCA cair em fallback de texto livre (`infCpl`, descrição de item etc.) —
  isso captura "M3" da descrição e pega número errado.
- Se não houver `<nVol>` → volume_m3 = 0 (atualiza depois via Excel/dialog).

**Histórico:** já tentamos restringir a "só decimal" achando que inteiros eram
quantidade de caixas, mas o cliente confirmou que `<nVol>` é cubagem em todos
os casos. Não reverter.

**NUNCA usar `<qVol>` como m³** — esse é, sim, a quantidade de volumes/caixas
padrão NF-e.
