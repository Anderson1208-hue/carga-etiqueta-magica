
-- Liberar NFs 741643, 741653, 742343 de volta para Preparação
-- Remove vínculo com veículo e devolve status para CARGA NO DEPOSITO
-- Limpa agendamentos duplicados, mantém apenas o AGENDAMENTO de 15/06

WITH nfs AS (
  SELECT id FROM public.notas_fiscais WHERE numero_nf IN ('741643','741653','742343')
)
DELETE FROM public.veiculo_nfs WHERE nf_id IN (SELECT id FROM nfs);

UPDATE public.notas_fiscais
   SET status_entrega = 'CARGA NO DEPOSITO'
 WHERE numero_nf IN ('741643','741653','742343');

-- Remove agendamentos AGUARDANDO AGENDA duplicados (mantém só o AGENDAMENTO 15/06)
DELETE FROM public.agendamentos
 WHERE nf_id IN (SELECT id FROM public.notas_fiscais WHERE numero_nf IN ('741643','741653','742343'))
   AND status = 'AGUARDANDO AGENDA';
