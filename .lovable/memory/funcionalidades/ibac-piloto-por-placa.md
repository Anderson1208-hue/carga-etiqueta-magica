---
name: IBAC piloto por placa e canhoto pós-prestação
description: Escopo do envio IBAC restrito por placa/data (LNA5B11, DTB9J73 em 25/08/2026); ocorrência em tempo real na sincronização da baixa e imagem só após encerrar prestação de contas
type: feature
---

`public.ibac_config_envio` ganhou:
- `placas_piloto text[]` — só NFs de veículos dessas placas são enviadas (vazio = sem restrição).
- `data_piloto date` — casa com `veiculos.data` (roteirização).
- `canhoto_apos_prestacao boolean` (default true) — eventos `envio_canhoto` só saem quando `veiculos.prestacao_contas_em` estiver preenchido.

Piloto configurado: LNA5B11 + DTB9J73, data 2026-08-25, whitelist de NFs zerada (escopo passa a ser por veículo). `envio_ativo` permanece **false** (kill switch) até autorização explícita do usuário.

Gatilhos de disparo do `ibac-sync` (fire-and-forget, sem bloquear a UI):
- `src/pages/BaixaEntrega.tsx` — após `markAsSynced` (fila offline) e após baixa gravada online. Ocorrência de entrega = momento da **sincronização**, não do clique.
- `src/pages/PrestacaoContas.tsx` — após "Encerrar prestação de contas" (libera as imagens do veículo).

UI de controle: aba **Envio** em `/integracao-ibac` (`IbacEnvioPanel`).
