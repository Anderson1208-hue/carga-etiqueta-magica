---
name: reentrega-libera-veiculo
description: Reagendamento (REENTREGA ou AGENDAMENTO) sempre desvincula veiculo_nfs e reseta status_entrega='NF EM ROTA' para 'CARGA NO DEPOSITO', para a NF reaparecer na Programação.
type: feature
---
Quando uma NF é reagendada após já ter saído para rota, o sistema obrigatoriamente:
1. `DELETE FROM veiculo_nfs WHERE nf_id = X` — libera a NF do veículo antigo.
2. `UPDATE notas_fiscais SET status_entrega='CARGA NO DEPOSITO' WHERE id = X AND status_entrega='NF EM ROTA'` — para passar pelos filtros da Programação (que excluem ENTREGUE/RECUSADO/EM ROTA).
3. Cria/atualiza o agendamento com status REENTREGA ou AGENDAMENTO + data_agendamento.

Vale para AMBOS os status que carregam data futura:
- **REENTREGA** — motorista voltou sem entregar, será reentregue.
- **AGENDAMENTO** — reagendamento normal de NF que já estava em rota.

Filtro `status_entrega='NF EM ROTA'` no UPDATE evita zerar status de NFs já entregues/recusadas que tenham agendamento adicional.

Caminhos cobertos:
- `src/pages/BaixaEntrega.tsx` (mobile motorista, ocorrência = "reentrega")
- `src/pages/Agendamento.tsx` (saveAgendamento single + saveBulkAgendamento)

Sem isso, a NF fica "presa" no veículo antigo e nunca reaparece na lista de disponíveis da Programação, mesmo com agendamento futuro válido.
