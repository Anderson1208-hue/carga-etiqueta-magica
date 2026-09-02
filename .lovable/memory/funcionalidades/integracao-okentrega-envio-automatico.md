---
name: OK Entrega — envio automático e bloqueio manual
description: Gatilhos de enfileiramento/transmissão OK Entrega (Pandurata) e lista de NFs bloqueadas por digitação direta no portal
type: feature
---

- Envio não depende mais do clique em Prestação de Contas. Gatilhos no banco:
  - `tg_okentrega_prestacao_encerrada` (veiculos.prestacao_contas_em) → chama `okentrega-enfileirar` do veículo.
  - `tg_okentrega_queue_kick` (insert pendente em okentrega_queue) → chama `okentrega-sync`.
  - `okentrega-sync` processa 1 canhoto por execução e se re-invoca (cooldown 3s, teto 60 saltos) enquanto houver pendência.
  - Cron `okentrega-reconciliacao-horaria` (05 de cada hora) como rede de segurança.
- `okentrega_config.blocklist_nfs`: NFs que NUNCA podem ser transmitidas (digitação manual no portal do cliente). Respeitado no enfileirar e no sync. Status `bloqueado` permitido em `okentrega_queue`.
- Bloqueadas (digitação manual no portal, 01-02/09/2026): 754898, 757000, 755540, 755537, 758217, 759515, 747081, 749728, 749516, 751022, 746921. A NF 749515 foi bloqueada por engano (erro de digitação de 759515) e foi desbloqueada e transmitida em 02/09/2026 (ocorrência 18909144).
- `okentrega-enfileirar` aceita `{"dry_run": true}`; `okentrega-sync` também (não envia, mostra o payload).
