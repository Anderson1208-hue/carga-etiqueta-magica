---
name: Integração OK Entrega (canhotos Pandurata)
description: Envio de baixas IOD+POD da PANDURATA (Bauducco, CNPJ raiz 70940994) à OK Entrega — imagem obrigatória JPEG 1536x240 @150dpi, token 14 dias, fila okentrega_queue
type: feature
---

A OK Entrega é a plataforma de canhotos da **PANDURATA (Bauducco)** — NÃO da IBAC/Cacau Show. A IBAC tem integração própria (`ibac-*`, ERP Praxio/Globus).

Elegibilidade por prefixo do CNPJ do emitente da NF-e: `70940994` (Pandurata Alimentos Ltda). Nunca configurar `61472205` (IBAC) nesta integração.

**Regra crítica da imagem:** JPEG **1536 × 240 px** com densidade **150 dpi**. Fora dessa especificação (ou sem imagem) a OK Entrega marca o comprovante como "Recusado" e o frete não é liberado. Conversão em `supabase/functions/_shared/okentrega-image.ts` (`prepararCanhoto`) — redimensiona e faz patch manual do segmento JFIF APP0 para gravar 150 dpi.

**Arquitetura:**
- `okentrega_config` (id=true): ambiente (homolog/producao), kill switch `envio_ativo`, entregadorId por ambiente (homolog 29668 / produção 85852), `cnpj_transportadora` (emitente do CT-e), `cnpjs_emitente` (match por prefixo para elegibilidade), `whitelist_nfs` (teste controlado), `modo_imagem`.
- `okentrega_token`: cache de token por ambiente (TTL 14 dias, renovado com 1h de margem).
- `okentrega_queue` → `okentrega-enfileirar` (seleciona baixas com foto e CNPJ elegível) → `okentrega-sync` (login, imagem, POST, grava `ocorrencia_entrega_id`, `status_baixa`, `status_comprovante`, `motivo_recusa`).
- `okentrega_log_envios`: request/response (base64 nunca é logado, só o tamanho).
- Tela `/integracoes/okentrega` (admin) com dry-run que gera o JSON para enviar a `okentrega1@stilsolucoes.com.br`.

**Ambientes:** homolog `https://hml.okentrega.com.br/assets/ws`, produção `https://www.okentrega.com.br/assets/ws`. Endpoints: `ws.0.loginapp.php` e `ws.0.ocorrenciaentregacache_api.php?access_token=`.

Credenciais em secrets (`OKENTREGA_EMAIL_*`, `OKENTREGA_PASSWORD_*`) — nunca no código.

**Legibilidade (retorno OK Entrega 19/08/2026: "comunicação OK, imagem ilegível"):** as fotos do
motorista são retrato. Encaixar a foto inteira (`contain`) na faixa 1536 × 240 reduz tudo a
~180 × 240 px → texto inaproveitável. Modo `recibo` (padrão) recorta **somente a tira do recibo da
DANFE** (nº da NF, data, nome, assinatura) e estica para 1536 × 240 com realce P&B.

**Detecção automática (Edge Function `_shared/okentrega-image.ts`, set/2026):** o recorte por
percentual fixo falhava quando o motorista fotografa a folha deitada/torta — chegava faixa quase
em branco na OK Entrega. Algoritmo atual: (1) papel = região clara; (2) tinta = pixel abaixo de 82%
da média LOCAL (janela 25) com papel claro na vizinhança e não muito escuro (exclui roupa/chão);
(3) dilatação 7×7 + maior componente conectado = tira do recibo; (4) se a tira estiver em pé,
rotaciona 90/270 — a metade com MAIS tinta é o cabeçalho impresso e deve terminar no topo
(`rot = esq >= dir ? 270 : 90`, calibrado empiricamente). Testar sempre com
`okentrega-sync` + `{"preview_queue_id": "<id>"}` (não envia nada, devolve base64 da faixa).
No app, o preparo espelho fica em `src/lib/okentrega-canhoto.ts`.
