---
name: Relatório diário de canhotos — envio de e-mail bloqueado até autorização
description: Rotina 06:00 gera arquivos, mas NUNCA envia e-mail sem autorização expressa do Anderson
type: constraint
---

A rotina `relatorio-canhotos-diario` (06:00 BRT + retry 07:00) gera e arquiva PDF/ZIP/Excel, mas o envio de e-mail fica desligado (`enviar_email: false`) até o Anderson autorizar explicitamente. Testes de envio confirmados em 11/09/2026 para anderson.teixeira@tlmlogistica.com.br (remetente canhotos@imagens.tlmlogistica.com.br). Destinatário final combinado: faturamento@tlmlogistica.com.br. **Why:** o usuário pediu explicitamente "não ligar o envio automático até minha autorização" em 11/09/2026.
