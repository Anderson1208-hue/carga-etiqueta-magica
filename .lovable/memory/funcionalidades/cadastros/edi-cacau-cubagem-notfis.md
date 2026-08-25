---
name: EDI Cacau (NOTFIS) — m³ pelo peso cubado
description: IBAC/Cacau Show — importar NOTFIS na linha da carga; m³ = peso cubado (registro 313) ÷ 300 kg/m³
type: feature
---

# Importar EDI Cacau na linha da carga

Ícone na linha de carga em `/cargas` (substituiu o ícone de impressora / Nota de Carga,
que não era usado — o PDF é gerado por outro caminho). Componente
`src/components/cargas/ImportarEdiCacauDialog.tsx` + parser `src/lib/notfis-cubagem-parser.ts`.

## Memória de cálculo (corrigida 25/08/2026)
Registro **313** do NOTFIS = 1 NF. Posições (0-index):
- `32-40` número da NF
- `78-85` caixas (2 dec)
- `85-100` valor da NF (2 dec)
- `100-107` peso bruto kg (2 dec)
- `107-112` **peso densidade/cubagem kg** (2 dec) — campo oficial 16 do PROCEDA NOTFIS 3.1

**m³ = peso cubado ÷ 300** (fator IBAC 300 kg/m³).

Validação: arquivos de 24/08/2026 (MQX5615, cargas 249727/249728) = 532 registros 313.
- Lote `220814570`: peso cubagem 2.289,60 kg ÷ 300 = **7,6320 m³**.
- Lote `220814460`: peso cubagem 14.149,50 kg ÷ 300 = **47,1650 m³**.
- Total: peso cubagem 16.439,10 kg ÷ 300 = **54,7970 m³**.

O campo `197-212`/posições oficiais `198-212` é **valor total do frete**, não peso cubado.
Não usar último campo numérico da linha como fallback de cubagem; isso superestima a carga
(ex.: 48.551,91 ÷ 300 = 161,84 m³, cálculo incorreto).

## Regras
- Só atualiza `volume_m3` de NFs **já existentes** na carga; nunca cria/duplica NF.
- NFs do arquivo fora da carga são ignoradas (listadas no preview).
- Passa a ser a fonte oficial de m³ do IBAC (antes: planilha manual). XML do IBAC
  continua retornando 0 — ver [mem://funcionalidades/xml-parser-ibac-nvol].
