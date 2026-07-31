---
name: IBAC — envio bloqueado por padrão e whitelist de teste
description: Kill switch, whitelist de NFs, modo de imagem (URL/base64) e código do evento de entrega da integração IBAC
type: feature
---

Configuração em `public.ibac_config_envio` (linha única, id=true), UI em `/integracao-ibac` → aba **Envio**:

- `envio_ativo` (default **false**): kill switch. Com false, `ibac-sync` retorna `status='envio_bloqueado'` e NÃO posta nada; a fila continua acumulando sem perda.
- `whitelist_nfs` (text[]): se preenchida, só envia eventos cujo `payload.numero_nf` ou `chave_acesso` esteja na lista. Usado para o teste controlado com a Cacau Show.
- `modo_imagem`: `url` (signed URL 7 dias, campo `foto_url`) ou `base64` (baixa do bucket `comprovantes` e envia `imagem_base64` + `imagem_nome` + `imagem_mime`, removendo `foto_url`).
- `codigo_evento_entrega` (default `01`): a IBAC exige que a imagem do canhoto vá no evento de entrega **01**; o `ibac-sync` usa esse código para `evento_interno='envio_canhoto'`, ignorando o de-para.
- `max_imagem_kb` (default 1024): acima disso o item falha com erro explícito em vez de estourar a requisição.

Regra: 1 requisição por NF (uma imagem por canhoto por NF) — não agrupar múltiplas NFs de uma entrega.
