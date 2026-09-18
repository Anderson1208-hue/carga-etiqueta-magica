
create or replace function public.fn_produto_recalcula_cubagem_nfs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cnpj text := regexp_replace(coalesce(new.cnpj_embarcador, ''), '\D', '', 'g');
begin
  if coalesce(new.volume_m3, 0) <= 0 then
    return new;
  end if;
  if left(v_cnpj, 8) in ('70940994', '61472205', '42431457', '94261534') then
    return new;
  end if;

  with alvo as (
    select distinct nf.id, regexp_replace(nf.cnpj_emitente, '\D', '', 'g') cnpj
    from public.notas_fiscais nf
    join public.itens_nf i on i.nf_id = nf.id
    where coalesce(nf.volume_m3, 0) = 0
      and nf.created_at > now() - interval '45 days'
      and regexp_replace(nf.cnpj_emitente, '\D', '', 'g') = v_cnpj
      and ltrim(btrim(i.c_prod), '0') = ltrim(btrim(new.codigo), '0')
  ), calc as (
    select a.id,
           sum(i.q_com * coalesce(p.volume_m3, 0)) m3,
           sum(i.q_com * coalesce(p.peso_bruto_cx_kg, 0)) peso,
           count(*) filter (where p.volume_m3 is null or p.volume_m3 = 0) falta
    from alvo a
    join public.itens_nf i on i.nf_id = a.id
    left join public.produtos p
      on p.cnpj_embarcador = a.cnpj
     and ltrim(btrim(p.codigo), '0') = ltrim(btrim(i.c_prod), '0')
    group by a.id
  )
  update public.notas_fiscais nf
     set volume_m3 = round(c.m3, 3),
         peso_bruto = case when coalesce(nf.peso_bruto, 0) = 0
                           then round(coalesce(c.peso, 0), 3)
                           else nf.peso_bruto end
    from calc c
   where c.id = nf.id and c.falta = 0 and c.m3 > 0;

  return new;
end;
$$;

drop trigger if exists tg_produto_recalcula_cubagem_nfs on public.produtos;
create trigger tg_produto_recalcula_cubagem_nfs
after insert or update of volume_m3, peso_bruto_cx_kg on public.produtos
for each row
execute function public.fn_produto_recalcula_cubagem_nfs();
