---
name: parada-visitada-vs-finalizada
description: GPS marca parada como "visitada"; só a baixa com comprovante marca "finalizada".
type: feature
---
# Visitada x Finalizada

- `processar-gps` NUNCA marca `finalizada`. Ao sair do raio com permanência >= tempo mínimo, grava status `visitada` (com `horario_saida` e `tempo_permanencia_min` factuais).
- Permanência abaixo do mínimo continua `visita_inconsistente`.
- `finalizada` só é escrita por `fn_sync_parada_from_baixa` (baixa de entrega com canhoto) ou pela finalização manual da rota.
- `paradas_concluidas` e o encerramento automático da rota continuam contando apenas `finalizada`.
- UI: badge "Loja Visitada" (tom pending), cor amarela no mapa. Listas de "próxima parada" e de candidatas a parada não programada tratam `visitada` como já atendida.

**Motivo:** motorista muitas vezes entrega e sai antes do cliente liberar comprovante, ou passa no local sem entregar. Visita é fato de GPS; entrega é fato de canhoto.
