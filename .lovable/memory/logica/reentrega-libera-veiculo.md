---
name: reentrega-libera-veiculo
description: REENTREGA (via Baixa de Entrega ou Agendamento) sempre desvincula veiculo_nfs e reseta status_entrega para CARGA NO DEPOSITO, para a NF reaparecer na Programação.
type: feature
---
Ao registrar status REENTREGA para uma NF (em qualquer dos dois caminhos), o sistema obrigatoriamente:
1. `DELETE FROM veiculo_nfs WHERE nf_id = X` — libera a NF do veículo antigo.
2. `UPDATE notas_fiscais SET status_entrega='CARGA NO DEPOSITO' WHERE id = X` — para passar pelos filtros da Programação (que excluem ENTREGUE/RECUSADO).
3. Cria/atualiza o agendamento com status REENTREGA + data_agendamento.

Caminhos cobertos:
- `src/pages/BaixaEntrega.tsx` (mobile motorista, ocorrência = "reentrega")
- `src/pages/Agendamento.tsx` (saveAgendamento single + saveBulkAgendamento)

Sem isso, a NF fica "presa" no veículo antigo e nunca reaparece na lista de disponíveis da Programação, mesmo com agendamento futuro válido.
