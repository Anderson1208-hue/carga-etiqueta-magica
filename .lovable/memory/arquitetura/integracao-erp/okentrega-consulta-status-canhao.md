---
name: OK Entrega — consulta de status do comprovante (Bauducco)
description: API de envio não expõe leitura do status de análise do canhoto; sonda okentrega-probe testou endpoints; pendente obter endpoint oficial ou painel web
type: feature
---

Contexto: faturamento vai depender do canhoto **validado** pelo embarcador (não só recebido).

Descobertas (16/10/2026, sonda `okentrega-probe`, somente leitura):
- `POST ws.0.ocorrenciaentregacache_api.php` (envio) SEMPRE responde `statusbaixa: "01 - Comprovante em análise"`
  no ato do envio — nunca devolve o resultado final da análise. Também vimos "51 - NF nao encontrada" e
  "52 - Divergência de transportadora".
- O endpoint de envio não aceita GET (422 "Ocorrenciaentrega JSON is not valid" em qualquer leitura).
- 409 em reenvio = "Imagem duplicada" (hash), sem status.
- Não há endpoint de consulta óbvio: testados e 404 → ocorrenciaentrega_api, ocorrenciasentrega_api,
  entrega(s)_api, comprovante(s)_api, consultaentrega_api, consultaocorrencia_api, rastreamento_api,
  nfe_api, notafiscal_api, documento_api.
- Não reenviar payload completo sem foto para "consultar": risco de sobrescrever/limpar o comprovante.

Caminhos pendentes (aguardando Anderson):
1. Pedir à Stil/OK Entrega o endpoint oficial de consulta de status do comprovante (ou manual da API).
2. Se houver login no painel web da OK Entrega, usar a metodologia SiriusLog (entrar no portal e puxar o retorno).

Cacau (IBAC/IBAE): API também não devolve validação posterior; Anderson vai confirmar se o portal web
deles mostra o retorno — se sim, mesma metodologia de automação de portal.
