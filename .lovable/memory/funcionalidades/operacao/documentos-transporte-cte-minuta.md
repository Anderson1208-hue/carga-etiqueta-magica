---
name: Documentos de Transporte (CT-e e Minuta)
description: Tabela ctes armazena CT-e e Minuta. Distingue por tipo_documento. Minuta sem chave fiscal usa identificador interno MIN-{cnpj}-{numero}.
type: feature
---

# Documentos de Transporte: CT-e e Minuta

A tabela `ctes` é genérica e armazena ambos os tipos via coluna `tipo_documento`:
- `CTE`: chave fiscal de 44 dígitos obrigatória, vinda do XML.
- `MINUTA`: chave fiscal opcional. Quando ausente, `chave_cte` recebe o identificador interno `MIN-{cnpj}-{numero}` (UNIQUE garante deduplicação).

## Colunas chave
- `tipo_documento` (CTE | MINUTA, default CTE)
- `chave_cte` (UNIQUE NOT NULL — recebe MIN-... para minutas sem chave)
- `numero_cte` (número do CT-e ou da minuta)
- `chave_nf_referenciada` (44 dígitos, opcional)
- `numero_nf_referenciada` (texto, fallback quando chave da NF não existe)
- `identificador_interno` (MIN-{cnpj}-{numero} para minutas)
- `data_emissao` (date, opcional)

## Vínculo com NF da carga
Estratégia em cascata no client:
1. Tenta `notas_fiscais.chave_acesso = chave_nf_referenciada`
2. Se falhar, tenta `notas_fiscais.numero_nf` normalizado (sem zeros à esquerda)
3. Se ainda falhar: erro claro pedindo importar XML da NF antes

## Parser de Minuta (PDF)
Edge function `parse-minuta-pdf` usa Lovable AI (Gemini). NUNCA inventa chave de 44 dígitos — retorna `""` quando ausente. Extrai: numero_minuta, numero_nf_referenciada, cnpj_emitente, razao_social, valor_frete, data_emissao, e chaves opcionais.

## Parser de CT-e (XML)
`src/lib/cte-parser.ts` — exige chave de 44 dígitos e chave da NF referenciada (pega do `<infNFe><chave>`).

## Praxio (preparado, não enviado)
Estrutura pronta: `tipo_documento`, `numero_cte` (= número documento), `chave_cte` (= identificador para a integração). Quando integração for ativada, enviar `tipo_documento` + número sem prefixos.
