alter table public.okentrega_config drop constraint if exists okentrega_config_modo_imagem_check;
alter table public.okentrega_config add constraint okentrega_config_modo_imagem_check
  check (modo_imagem in ('recibo','contain','cover','stretch'));
update public.okentrega_config set modo_imagem = 'recibo', envio_ativo = false where id = true;