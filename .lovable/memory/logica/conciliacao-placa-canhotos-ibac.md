---
name: Conciliação por placa (NFs roteirizadas x canhotos IBAC)
description: Regra de fechamento por veículo na prestação de contas; classificação de cada NF roteirizada e bloqueio do encerramento com erros
type: feature
---

Regra obrigatória: ao encerrar a prestação de contas de um veículo, o sistema confronta as NFs roteirizadas na placa com os canhotos enviados à IBAC.

`NFs roteirizadas = canhotos enviados + ocorrências válidas (reentrega/recusa/ausente/end. não encontrado) + fora do escopo IBAC`

Implementação:
- Função `public.conciliar_veiculo_ibac(p_veiculo_id uuid)` (security definer, só admin/operador ativo) classifica cada NF de `veiculo_nfs`: `canhoto_enviado`, `canhoto_na_fila`, `canhoto_erro_envio`, `canhoto_cancelado`, `canhoto_nao_enfileirado`, `entregue_sem_foto`, `ocorrencia_valida`, `fora_escopo_ibac`, `sem_desfecho` — com gravidade `ok | atencao | erro`.
- Escopo IBAC = prefixo de CNPJ (destinatário OU emitente) ativo em `cnpj_envio_canhoto_auto`.
- UI: `src/components/prestacao/ConciliacaoIbacPanel.tsx` dentro de `PrestacaoContas.tsx`; roda automaticamente ao selecionar o veículo e é recarregada logo após "Encerrar Prestação de Contas".
- Antes do encerramento, `canhoto_nao_enfileirado` conta como "atenção" (é o estado natural); depois do encerramento é ERRO.
- Encerramento com linhas em ERRO exige confirmação explícita do operador.
