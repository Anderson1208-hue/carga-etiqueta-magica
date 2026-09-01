CREATE OR REPLACE FUNCTION public.listar_cidades_base(_embarcador_id uuid, _todas boolean DEFAULT false)
RETURNS TABLE(uf text, municipio text, total_nfs bigint, total_clientes bigint, ultima_emissao date, atendida boolean)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  with nfs as (
    select
      upper(nf.dest_uf)::text as uf,
      upper(translate(nf.dest_cidade,
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
        'AAAAAEEEEIIIIOOOOOUUUUCNAAAAAEEEEIIIIOOOOOUUUUCN'))::text as municipio,
      (regexp_replace(coalesce(nf.cnpj_emitente, ''), '\D', '', 'g') like left(v_cnpj, 8) || '%') as do_fornecedor,
      nf.cnpj_destinatario,
      nf.data_emissao
    from public.notas_fiscais nf
    where coalesce(nf.dest_cidade, '') <> ''
      and coalesce(nf.dest_uf, '') <> ''
      and (_todas or regexp_replace(coalesce(nf.cnpj_emitente, ''), '\D', '', 'g') like left(v_cnpj, 8) || '%')
  ), agrup as (
    select
      n.uf, n.municipio,
      count(*) filter (where n.do_fornecedor)::bigint as total_nfs,
      count(distinct n.cnpj_destinatario) filter (where n.do_fornecedor)::bigint as total_clientes,
      max(n.data_emissao) filter (where n.do_fornecedor) as ultima_emissao,
      bool_or(n.do_fornecedor) as atendida
    from nfs n
    group by 1, 2
  ), cadastro as (
    select
      upper(d.uf)::text as uf,
      upper(translate(d.cidade,
        'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑáàâãäéèêëíìîïóòôõöúùûüçñ',
        'AAAAAEEEEIIIIOOOOOUUUUCNAAAAAEEEEIIIIOOOOOUUUUCN'))::text as municipio
    from public.destinatario_enderecos d
    where _todas
      and coalesce(d.cidade, '') <> ''
      and coalesce(d.uf, '') <> ''
    group by 1, 2
  )
  select
    coalesce(a.uf, c.uf) as uf,
    coalesce(a.municipio, c.municipio) as municipio,
    coalesce(a.total_nfs, 0)::bigint as total_nfs,
    coalesce(a.total_clientes, 0)::bigint as total_clientes,
    a.ultima_emissao,
    coalesce(a.atendida, false) as atendida
  from agrup a
  full outer join cadastro c
    on c.uf = a.uf and c.municipio = a.municipio
  order by coalesce(a.atendida, false) desc, coalesce(a.total_nfs, 0) desc, 2;
end;
$function$;

REVOKE EXECUTE ON FUNCTION public.listar_cidades_base(uuid, boolean) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.listar_cidades_base(uuid, boolean) TO authenticated;