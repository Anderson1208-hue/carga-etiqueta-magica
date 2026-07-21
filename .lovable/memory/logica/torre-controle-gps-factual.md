---
name: Torre Controle GPS Factual
description: Torre de Controle deve exibir chegada/saída por GPS factual; baixa de entrega não cria horários de GPS.
type: constraint
---
# Torre de Controle — GPS factual

- Chegada, saída e permanência de parada devem vir de pings GPS dentro do raio da parada.
- `baixas_entrega` pode finalizar operacionalmente a parada, mas não pode preencher `horario_chegada`, `horario_saida` nem `tempo_permanencia_min`.
- Um mesmo ping não pode ser contado como chegada/permanência de duas paradas diferentes; análise visual deve ser sequencial.
- Se não houver ping dentro do raio, a UI deve mostrar “sem GPS no raio” em vez de inventar horário.

**Por quê:** o cliente identificou horários sobrepostos/iguais na Torre. A regra é trabalhar com fatos GPS, separando baixa manual de evidência de posicionamento.