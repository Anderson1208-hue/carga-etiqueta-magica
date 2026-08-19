update public.ibac_config_envio
set envio_ativo = false,
    modo_imagem = 'base64',
    max_imagem_kb = 1024,
    codigo_evento_entrega = '01',
    whitelist_nfs = (
      select array_agg(distinct nf.numero_nf)
      from veiculo_nfs vn
      join veiculos v on v.id = vn.veiculo_id
      join notas_fiscais nf on nf.id = vn.nf_id
      join baixas_entrega b on b.nf_id = nf.id
      where v.placa = 'CBL1702'
        and b.registrado_em::date = '2026-08-19'
        and nf.cnpj_emitente like '61.472.205%'
    )
where id = true;