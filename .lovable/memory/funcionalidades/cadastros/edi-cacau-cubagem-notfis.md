---
name: EDI Cacau (NOTFIS) — m³ pelo peso cubado
description: IBAC/Cacau Show — importar NOTFIS na linha da carga; m³ = peso cubado (registro 313) ÷ 300 kg/m³
type: feature
---

# Importar EDI Cacau na linha da carga

Ícone na linha de carga em `/cargas` (substituiu o ícone de impressora / Nota de Carga,
que não era usado — o PDF é gerado por outro caminho). Componente
`src/components/cargas/ImportarEdiCacauDialog.tsx` + parser `src/lib/notfis-cubagem-parser.ts`.

## Memória de cálculo (confirmada 25/08/2026)
Registro **313** do NOTFIS = 1 NF. Posições (0-index):
- `32-40` número da NF
- `78-85` caixas (2 dec)
- `85-100` valor da NF (2 dec)
- `100-107` peso bruto kg (2 dec)
- `197-212` **peso cubado kg** (2 dec) — último campo numérico do registro

**m³ = peso cubado ÷ 300** (fator IBAC 300 kg/m³).

Validação: arquivos de 24/08/2026 (MQX5615, cargas 249727/249728) = 532 registros 313,
peso bruto somado 16.385,05 kg vs 16.384,78 kg no banco (match 1:1); total 161,83 m³.

## Regras
- Só atualiza `volume_m3` de NFs **já existentes** na carga; nunca cria/duplica NF.
- NFs do arquivo fora da carga são ignoradas (listadas no preview).
- Passa a ser a fonte oficial de m³ do IBAC (antes: planilha manual). XML do IBAC
  continua retornando 0 — ver [mem://funcionalidades/xml-parser-ibac-nvol].
