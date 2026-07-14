---
name: Enriquecimento fiscal via XML
description: RPC enriquecer_cadastros_fiscais_lote preenche IE/CRT/regime/UF/IBGE em embarcadores e destinatarios a partir dos XMLs — só campos NULOS
type: feature
---

# Enriquecimento fiscal automático via XML

Ao importar XMLs em `/cargas`, o frontend chama após o `importar_carga_xml_lote`
o RPC **`enriquecer_cadastros_fiscais_lote(payload jsonb)`** com os dados
fiscais extraídos do XML.

## Campos populados

- **`embarcadores`**: `ie`, `regime_tributario` (mapeado do CRT NF-e), `uf`,
  `municipio`, `codigo_municipio_ibge`.
- **`destinatarios`**: `ie`, `indicador_ie` (1=contrib, 2=isento, 9=não contrib).

## Regra: nunca sobrescreve

O `UPDATE` só ocorre quando o campo destino está **NULL**. Cadastros já
revisados manualmente (`rascunho=false` ou não) ficam intactos. Fluxo:
XML enriquece rascunho → operador revisa em `/embarcadores` ou `/destinatarios`
→ dados manuais viram fonte da verdade.

## Mapeamento CRT → regime_tributario

- CRT 1 (Simples) → `simples`
- CRT 2 (Simples excesso) → `simples`
- CRT 3 (Regime normal) → `lucro_presumido` (padrão; usuário ajusta para `lucro_real` se preciso)
- CRT 4 (MEI) → `mei`

## Parser

`src/lib/xml-parser.ts` extrai (opcional, todos podem ser null):
- `ieEmitente`, `crtEmitente`, `ufEmitente`, `municipioEmitente`, `codigoMunicipioIbgeEmitente`
- `ieDestinatario`, `indicadorIeDestinatario`

## Não crítico

Chamada envolvida em try/catch — se falhar, não bloqueia a importação da carga.
