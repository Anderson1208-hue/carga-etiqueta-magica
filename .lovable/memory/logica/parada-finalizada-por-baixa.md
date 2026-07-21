---
name: parada-finalizada-por-baixa
description: Trigger fn_sync_parada_from_baixa finaliza status operacional por baixa, mas não cria horários de GPS.
type: feature
---
# Parada finaliza por baixa sem inventar GPS

`baixas_entrega` AFTER INSERT/UPDATE OF status -> `fn_sync_parada_from_baixa`.

Quando `NEW.status='entregue'`:
- Busca CNPJ via `notas_fiscais.cnpj_destinatario`.
- Acha rota ativa do `veiculo_id` (mais recente).
- Marca a primeira parada não fechada com mesmo CNPJ como `finalizada`.
- **Não preenche** `horario_chegada`, `horario_saida` nem `tempo_permanencia_min` — esses campos são fatos de GPS.
- Recalcula `paradas_concluidas` e marca rota `finalizada` se todas fechadas.

Motivo: GPS pode falhar (app fechado, sem permissão background). Baixas seguem fluindo e a tela de monitoramento reflete progresso operacional, mas a Torre não deve exibir horário inventado.

Convive com o fluxo do `processar-gps` (que usa geofence). Ambos atualizam o mesmo conjunto de status terminais.
