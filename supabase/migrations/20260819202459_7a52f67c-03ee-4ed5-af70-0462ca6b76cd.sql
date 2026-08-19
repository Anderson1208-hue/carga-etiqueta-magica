update public.okentrega_queue
set status='enviado',
    erro_mensagem='HTTP 409 - ocorrência duplicada: já registrada em 18/08 (ocorrenciaentregaId 3237255). Reenvio da imagem corrigida depende de reabertura pela OK Entrega.',
    ocorrencia_entrega_id=3237255
where numero_nf='753801';