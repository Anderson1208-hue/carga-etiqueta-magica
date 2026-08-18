update public.okentrega_config
set cnpj_transportadora = '31598974000142',
    cnpjs_emitente = ARRAY['70940994'],
    whitelist_nfs = ARRAY['754706'],
    ambiente = 'homolog',
    envio_ativo = false,
    modo_imagem = 'contain',
    updated_at = now()
where id = true;