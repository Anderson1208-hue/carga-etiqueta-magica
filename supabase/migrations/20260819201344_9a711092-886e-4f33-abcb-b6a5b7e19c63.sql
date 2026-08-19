update public.okentrega_queue set status='pendente', tentativas=0, erro_mensagem=null where numero_nf in ('753801','753557');
update public.okentrega_config set envio_ativo = true where id = true;