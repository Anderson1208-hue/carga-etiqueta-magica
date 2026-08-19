update public.ibac_config_envio set envio_ativo = true where id = true;

update public.ibac_eventos_queue
set status = 'cancelado', erro_mensagem = 'HOLD_ETAPA2'
where status = 'pendente'
  and evento_interno = 'envio_canhoto'
  and (payload->>'numero_nf') in ('3993806','3993808','3996608','3996610','3996751','3996752','3996753','3996754','3996755','3996756','3996762','3996763','3996764','3996765','3996766','3996767','3996768');