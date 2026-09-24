UPDATE public.okentrega_queue
   SET status = 'revisao', processamento_iniciado_em = NULL,
       erro_mensagem = 'Foto original de 3,4 MB excede a capacidade de processamento do servidor (WORKER_RESOURCE_LIMIT). Precisa de foto reduzida.'
 WHERE numero_nf = '761006' AND enviado_em IS NULL AND ocorrencia_entrega_id IS NULL;