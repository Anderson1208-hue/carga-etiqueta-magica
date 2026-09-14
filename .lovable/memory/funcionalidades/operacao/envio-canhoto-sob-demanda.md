---
name: Envio de Canhoto sob demanda
description: Tela e rotina manual para enviar canhotos por e-mail filtrando embarcador, período ou NFs
type: feature
---

Rota `/integracoes/envio-canhoto` (menu Transporte > Integração, junto de IBAC e OK Entrega).
Acesso: mesma lista da OK Entrega (`EMAILS_ACESSO_OKENTREGA`) + administradores (`useAcessoEnvioCanhoto`).

Edge function `enviar-canhotos-manual` (verify_jwt=true), ações `previa`, `criar`, `passo`, `links`.
Processamento em passos (1 imagem por invocação; volumes de 10 canhotos em PDF + ZIP), planilha XLSX das notas sem foto,
links assinados de 90 dias no bucket `relatorios-canhotos`, envio via `send-transactional-email` com template
`canhotos-envio-manual`. Limite de 500 notas por envio. Histórico em `public.envios_canhoto_manuais`.
Originais em `comprovantes` nunca são apagados; a rotina diária automática segue desligada até autorização.
