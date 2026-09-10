# Rotina diária de atualização do tracking Pandurata (portal do cliente)

Nada é alterado nem enviado agora. Este documento descreve o procedimento pronto para ser ligado quando você autorizar.

## Regras da rotina

- Considera **apenas notas com data a partir de 01/09/2026**. Notas anteriores nunca entram.
- **Todas as notas novas** entram na fila automaticamente conforme a carga é cadastrada/aberta.
- A cada rodada, envia **todas as mudanças de status** desde a última execução:
  1. Em trânsito para filial da transportadora
  2. Na filial da transportadora
  3. Em trânsito para cliente
  4. Aguardando descarga
  5. Entrega realizada aguardando canhoto
- Nota **entregue é informada uma única vez** e sai da fila: depois de confirmada a entrega no portal, ela é marcada como concluída e não é mais consultada nem reenviada.
- Notas que o portal já mostra em situação final (baixada no sistema deles, recusa, devolução, canhoto retido) também saem da fila, sem tentativa de alteração.
- Nunca regride status e nunca repete um envio já aceito.

## Horário

- Segunda a sexta, **10:30** (horário de Brasília).
- Não roda em sábados, domingos e feriados (nacionais + estaduais RJ), usando o calendário de dias úteis já existente no sistema.
- Se o portal recusar algum item, ele permanece na fila e é tentado na rodada seguinte; recusas repetidas geram alerta em vez de novas tentativas infinitas.

## Controles de segurança

- Uma execução por vez (trava): se uma rodada demorar, a próxima não começa em paralelo.
- Limite de notas por rodada, com continuação automática enquanto houver fila.
- Registro por nota: o que foi enviado, resposta do portal, data/hora — para conferência.
- Se o portal cair ou o login falhar, a rotina para e avisa, sem tentar em loop.
- Interruptor liga/desliga: enquanto estiver desligado, **nada é enviado**, mesmo com o horário chegando.

## Detalhes técnicos

- Nova tabela `siriuslog_fila`: `numero_nf`, `invoice_detail_id`, `trip_id`, `status_enviado`, `status_portal`, `concluido_em`, `tentativas`, `ultimo_erro`, `updated_at` (+ GRANTs e RLS: leitura para operadores, escrita só por serviço).
- Nova tabela `siriuslog_execucoes` (lease/single-flight + histórico da rodada: início, fim, totais, pausa por erro).
- Enfileiramento: trigger em `notas_fiscais`/`cargas` inserindo em `siriuslog_fila` somente quando a data da nota for `>= 2026-09-01`; backfill inicial via `siriuslog_plano`.
- `supabase/functions/siriuslog-lote/index.ts` passa a ler a fila em lote limitado, respeitar o interruptor e o lease, marcar `concluido_em` quando o alvo é "Entrega realizada aguardando canhoto" (ou status final do portal) e gravar `ultimo_erro` nas recusas 422.
- Nova função de agendamento com guarda de dias úteis (`isDiaUtil`) chamada por `pg_cron` às 13:30 UTC (10:30 BRT) de segunda a sexta; a guarda de feriado fica no código, não no cron.
- Modo padrão continua `dry_run: true`. A gravação real só ocorre com o interruptor ligado por você.

## O que fica pendente de você

- Autorizar a criação das tabelas/agendamento (nada é criado antes disso).
- Autorizar o ligamento do envio real.
