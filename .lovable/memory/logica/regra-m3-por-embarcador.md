---
name: Regra de cubagem (m³) por embarcador
description: Fonte de m³ por emitente — XML só para Pandurata/Bauducco; Docile/Arcor/IBAC por arquivo; Mars e demais pelo cadastro de produtos.
type: feature
---
Regra vigente (31/07/2026), implementada em `src/lib/xml-parser.ts` (`extractVolumeM3`):

- **Pandurata / Bauducco:** m³ vem do XML — `<vol><nVol>` é a cubagem (posição fixa no layout do emissor).
- **Docile, Arcor, IBAC:** m³ NUNCA vem do XML. Entra por arquivo/planilha importada (diálogos de atualização de m³).
- **Mars (Masterfoods, CNPJ 29.737.368) e todos os demais:** m³ vem do **cadastro de produtos** (`itens_nf.q_com × produtos.volume_m3`), via `aplicar_cubagem_produtos_nf` ou o botão "Aplicar nas NFs" em Cadastros → Cadastro na Chegada.

Motivo: para emitentes fora da allowlist, `nVol` é **quantidade de volumes/pallets** e era lido como m³ (ex.: NF 473076 gravou 4 m³ em vez de ~1,5 m³). Qualquer emitente não listado retorna 0 no parser — nunca inventar m³ a partir de texto livre.

Dados faltantes de produto são completados manualmente em `/produtos/chegada` (fila por frequência) ou em `/produtos`.

Objetivo final: quando todos os embarcadores tiverem cadastro de produtos, **toda** a cubagem passa a vir do cadastro e as exceções acima são desativadas.
