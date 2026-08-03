insert into public.cnpj_envio_canhoto_auto (cnpj, descricao, ativo)
values ('17611014', 'ASSB / Cacau Show (lojas) - teste controlado', true)
on conflict (cnpj) do update set ativo = true, descricao = excluded.descricao, updated_at = now();

update public.ibac_config_envio
set whitelist_nfs = array['3897130','3897131','3897255','3896308','3896307'],
    envio_ativo = false,
    updated_at = now()
where id = true;