---
name: Integração OK Entrega (canhotos)
description: Envio de baixas IOD+POD à OK Entrega — imagem obrigatória JPEG 1536x240 @150dpi, token 14 dias, fila okentrega_queue
type: feature
---

O envio de canhotos da IBAC é feito para a plataforma **OK Entrega** (não SIRIUS).

**Regra crítica da imagem:** JPEG **1536 × 240 px** com densidade **150 dpi**. Fora dessa especificação (ou sem imagem) a OK Entrega marca o comprovante como "Recusado" e o frete não é liberado. Conversão em `supabase/functions/_shared/okentrega-image.ts` (`prepararCanhoto`) — redimensiona e faz patch manual do segmento JFIF APP0 para gravar 150 dpi.

**Arquitetura:**
- `okentrega_config` (id=true): ambiente (homolog/producao), kill switch `envio_ativo`, entregadorId por ambiente, `cnpj_transportadora` (emitente do CT-e), `cnpjs_emitente` (match por prefixo para elegibilidade), `whitelist_nfs` (teste controlado), `modo_imagem`.
- `okentrega_token`: cache de token por ambiente (TTL 14 dias, renovado com 1h de margem).
- `okentrega_queue` → `okentrega-enfileirar` (seleciona baixas com foto e CNPJ elegível) → `okentrega-sync` (login, imagem, POST, grava `ocorrencia_entrega_id`, `status_baixa`, `status_comprovante`, `motivo_recusa`).
- `okentrega_log_envios`: request/response (base64 nunca é logado, só o tamanho).
- Tela `/integracoes/okentrega` (admin) com dry-run que gera o JSON para enviar a `okentrega1@stilsolucoes.com.br`.

**Ambientes:** homolog `https://hml.okentrega.com.br/assets/ws`, produção `https://www.okentrega.com.br/assets/ws`. Endpoints: `ws.0.loginapp.php` e `ws.0.ocorrenciaentregacache_api.php?access_token=`.

Credenciais em secrets (`OKENTREGA_EMAIL_*`, `OKENTREGA_PASSWORD_*`) — nunca no código.
