---
name: IBAC — dois endpoints (ocorrência x somente imagem)
description: Canhoto isolado vai para /app/api/integracao-canhoto com payload chave/chaveCte/imagens; evita HTTP 409 de ocorrência duplicada
type: feature
---

Servidor IBAC: `https://cacaushow.mosistemas.com`

1. **Ocorrência (com ou sem imagem juntas)** → `/app/api/track/rastreamentos/atualizar-rastreamento`
   Payload: `chaveNota`, `numeroNota`, `cnpjTransportadora`, `codigoEventoOcorrencia` (number),
   `dataEventoOcorrencia` (dd-MM-yyyy), `horaEventoOcorrencia` (HH:mm:ss), `descricaoOcorrencia`, `imagens[]`.

2. **Somente imagem (canhoto enviado depois)** → `/app/api/integracao-canhoto`
   Payload: `{ chave, chaveCte?, imagens: [{ base64 | urlImagem, nomeImagem, tipo: "CANHOTO" }] }`.
   NÃO reenviar a ocorrência — reenviar no endpoint 1 gera **HTTP 409 "Ocorrência já integrada"**.

Implementação em `supabase/functions/ibac-sync/index.ts`: eventos `evento_interno='envio_canhoto'`
vão para `IBAC_CANHOTO_URL` (secret opcional; default = origem de `IBAC_API_URL` + `/app/api/integracao-canhoto`).
`chaveCte` é buscado em `public.ctes` por `nf_id` ou `chave_nf_referenciada`. Autenticação: header `Api-Key` nos dois endpoints.
