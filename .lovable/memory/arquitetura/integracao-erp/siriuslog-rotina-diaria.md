---
name: Rotina diária de tracking Pandurata (Sirius Log)
description: Fila, trava, agendamento e interruptor da rotina que atualiza status das notas Pandurata no portal Sirius Log
type: feature
---

Função: `supabase/functions/siriuslog-rotina/index.ts` (orquestra) chamando `siriuslog-lote` (login + cadeia de status 21→22→23→2→17).

Tabelas:
- `config_tracking_pandurata` (singleton): `ativo` (interruptor de gravação, **começa false**), `data_inicial` = 2026-09-01, `limite_por_rodada` = 40, `max_tentativas` = 3, `pausado_motivo`.
- `fila_tracking_pandurata` (1 linha por NF): `status_enviado`, `status_portal`, `tentativas`, `ultimo_erro`, `ultima_tentativa_em`, `concluido_em`, `motivo_conclusao`.
- `execucoes_tracking_pandurata`: histórico + lease (trava single-flight, 15 min).

Funções SQL: `tracking_pandurata_iniciar_rodada(text)` (trava, retorna NULL se já rodando) e `tracking_pandurata_e_dia_util(date)` (usa `add_dias_uteis`).

Regras: só notas >= `data_inicial`; notas que chegam a "Entrega realizada..." ou status final do portal recebem `concluido_em` e saem da fila para sempre; fila é rotacionada por `ultima_tentativa_em` para o limite por rodada não travar nas mesmas notas; com `ativo=false` (ou `{"simular":true}`) roda em simulação e NADA é enviado.

Agendamento: cron `tracking-pandurata-diario`, `30 13 * * 1-5` (10:30 BRT); guarda de feriado RJ dentro da função.
