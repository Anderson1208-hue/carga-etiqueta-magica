---
name: Rotina diária de tracking Pandurata (Sirius Log)
description: Fila, trava, agendamento, envio imediato na abertura da carga e regra de falhas da rotina que atualiza status das notas Pandurata no portal Sirius Log
type: feature
---

Função: `supabase/functions/siriuslog-rotina/index.ts` (orquestra) chamando `siriuslog-lote` (login + cadeia de status 21→22→23→2→17).

Tabelas:
- `config_tracking_pandurata` (singleton): `ativo` (interruptor de gravação), `data_inicial` = 2026-09-01, `limite_por_rodada` = 40, `max_tentativas` = 3, `pausado_motivo`.
- `fila_tracking_pandurata` (1 linha por NF): `status_enviado`, `status_portal` (lido ANTES do envio), `tentativas`, `ultimo_erro`, `ultima_tentativa_em`, `concluido_em`, `motivo_conclusao`.
- `execucoes_tracking_pandurata`: histórico + lease (trava single-flight, 15 min).

Regra de status alvo (30/09/2026, pedido do Anderson): "Na filial" SOMENTE quando a carga está aberta no nosso sistema (carga `fechada` = NF só cadastrada, fica `aguardando_abertura_carga`); rota → "Em trânsito para cliente"; baixa entregue → "Entrega realizada aguardando canhoto". 34 notas de cargas fechadas já enviadas como "Na filial" em 30/09 ficam como estão (decisão do usuário).

Status do portal fora da cadeia (baixa de EDI, SAP, recusa, devolução, canhoto retido, reentrega, nome novo) = final, nunca mexer. Check-in/doca = equivalente a "Aguardando descarga". Bug corrigido 30/09: "…aguardando baixa DE EDI" não batia e a rotina tentava regredir (422 diário).

Tentativas (30/09/2026): `tentativas` = FALHAS do dia (recusa/erro). Envio aceito ou nota já em dia zera. Limite de 3 vale só no dia; no dia seguinte a nota volta. Antes, envio aceito também contava e notas que avançavam 3 dias travavam sem erro.

Envio imediato (autorizado 30/09/2026): trigger `tg_tracking_pandurata_carga_aberta` em `cargas` (status → aberta) chama `siriuslog-rotina` com `{nfs:[...]}` das NFs Pandurata da carga; roda em qualquer dia; espera até ~2 min se houver rodada em andamento.

Agendamento: cron `tracking-pandurata-diario`, `30 13 * * 1-5` (10:30 BRT); guarda de feriado RJ dentro da função.
