---
name: Endereçamento de NFs no CD
description: Tela /enderecamento permite cadastrar múltiplas posições físicas (texto livre) por NF; aparecem em destaque junto com a MR no header de cada NF nos PDFs de Nota de Carga.
type: feature
---

## Modelo
- Tabela `nf_enderecamento` (1 NF → N posições)
- Campos: `nf_id`, `posicao` (texto livre, ex.: "A-01-02"), `principal` (bool, opcional)
- Constraint: posições únicas por NF (case-insensitive via `lower(btrim(posicao))`)
- RLS: admins e operadores ativos podem ler/criar/atualizar/deletar

## UI
- Rota `/enderecamento` no menu Depósito (ícone MapPin)
- Lista NFs com `status_entrega` em ('CARGA NO DEPOSITO', 'NF EM ROTA')
- Busca por NF, CNPJ, cliente, bairro ou posição
- Filtro "Apenas sem endereço"
- Cada linha: chips removíveis com posições + input para adicionar

## PDF (Nota de Carga)
- Helper `fetchEnderecamentosByNfIds` em `src/lib/enderecamento.ts` (chunking 200 ids, paginação 1000)
- Campo opcional `enderecamentos: string[]` em `NotaFiscalPDF`
- Renderiza bloco azul claro abaixo do destinatário com:
  - **MR X — Nome da macro-região** (linha 1)
  - **Endereçamento CD: A-01-02 • B-03-01** (ou "— (não cadastrado)")
- Aplicado em: Romaneio, Cargas, ConsultaNF, Roteirização (4 callsites do `generateNotaDeCargaPDF`)
