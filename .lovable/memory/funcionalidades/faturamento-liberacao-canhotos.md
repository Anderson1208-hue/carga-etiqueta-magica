---
name: Faturamento — liberação por canhoto validado
description: Ideia guardada (Anderson, 16/10/2026): faturamento só cobra NF com canhoto validado; depende de retorno de validação dos portais
type: feature
---

Ideia em espera, NÃO implementar ainda. Anderson quer desenvolver faturamento onde uma NF só é
liberada para cobrança quando o canhoto estiver **validado** (não apenas recebido).

Pré-requisito em andamento: obter o retorno de validação de cada embarcador.
- **Bauducco (OK Entrega):** portal devolve status de análise do comprovante ("em análise" →
  aprovado/recusado). Checagem de retorno autorizada e em implementação.
- **Cacau (IBAC/IBAE):** portal não devolve validação via API; Anderson vai confirmar se o retorno
  aparece no portal web deles. Se sim, a ideia é puxar via automação de portal (mesma metodologia
  do SiriusLog — entrar no sistema e extrair o retorno).

Decisões pendentes do usuário (perguntadas em 16/10, sem resposta ainda):
1. Nota com canhoto recusado/ruim: bloqueia faturamento ou libera com alerta manual?
2. Bauducco "em análise" há muitos dias: após quantos dias permitir liberação manual (com registro)?
