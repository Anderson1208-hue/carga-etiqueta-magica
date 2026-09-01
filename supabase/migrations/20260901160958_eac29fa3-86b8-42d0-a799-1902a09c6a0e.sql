create or replace function public.listar_cidades_atendidas(_embarcador_id uuid)
returns table (
  uf text,
  municipio text,
  total_nfs bigint,
  total_clientes bigint,
  ultima_emissao date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cnpj text;
begin
  if not public.pode_gestao_comercial() then
    raise exception 'sem permissao';
  end if;

  select regexp_replace(coalesce(e.cnpj, ''), '\D', '', 'g')
    into v_cnpj
  from public.embarcadores e
  where e.id = _embarcador_id;

  if v_cnpj is null or length(v_cnpj) < 8 then
    return;
  end if;

  return query
  select
    upper(nf.dest_uf)::text as uf,
    upper(translate(nf.dest_cidade,
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
      'AAAAAEEEEIIIIOOOOOUUUUCNAAAAAEEEEIIIIOOOOOUUUUCN'))::text as municipio,
    count(*)::bigint as total_nfs,
    count(distinct nf.cnpj_destinatario)::bigint as total_clientes,
    max(nf.data_emissao) as ultima_emissao
  from public.notas_fiscais nf
  where regexp_replace(coalesce(nf.cnpj_emitente, ''), '\D', '', 'g') like left(v_cnpj, 8) || '%'
    and coalesce(nf.dest_cidade, '') <> ''
    and coalesce(nf.dest_uf, '') <> ''
  group by 1, 2
  order by 3 desc;
end;
$$;

revoke execute on function public.listar_cidades_atendidas(uuid) from anon, public;
grant execute on function public.listar_cidades_atendidas(uuid) to authenticated;