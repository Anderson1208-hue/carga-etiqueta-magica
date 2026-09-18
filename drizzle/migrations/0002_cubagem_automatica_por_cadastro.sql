
create or replace function public.fn_nf_cubagem_por_cadastro()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cnpj text;
  v_m3 numeric;
  v_peso numeric;
  v_falta int;
begin
  select regexp_replace(nf.cnpj_emitente, '\D', '', 'g') into v_cnpj
  from public.notas_fiscais nf where nf.id = new.nf_id;

  if v_cnpj is null then
    return new;
  end if;

  -- Emitentes cuja cubagem NAO vem do cadastro de produtos:
  -- Pandurata/Bauducco (XML), IBAC, IBAE e Docile (planilha/NOTFIS).
  if left(v_cnpj, 8) in ('70940994', '61472205', '42431457', '94261534') then
    return new;
  end if;

  select
    sum(i.q_com * coalesce(p.volume_m3, 0)),
    sum(i.q_com * coalesce(p.peso_bruto_cx_kg, 0)),
    count(*) filter (where p.volume_m3 is null or p.volume_m3 = 0)
  into v_m3, v_peso, v_falta
  from public.itens_nf i
  left join public.produtos p
    on p.cnpj_embarcador = v_cnpj
   and ltrim(btrim(p.codigo), '0') = ltrim(btrim(i.c_prod), '0')
  where i.nf_id = new.nf_id;

  -- So grava quando TODOS os itens tem produto cadastrado com m3.
  if v_falta > 0 or coalesce(v_m3, 0) <= 0 then
    return new;
  end if;

  update public.notas_fiscais nf
     set volume_m3 = round(v_m3, 3),
         peso_bruto = case when coalesce(nf.peso_bruto, 0) = 0
                           then round(coalesce(v_peso, 0), 3)
                           else nf.peso_bruto end
   where nf.id = new.nf_id
     and coalesce(nf.volume_m3, 0) <> round(v_m3, 3);

  return new;
end;
$$;

drop trigger if exists tg_nf_cubagem_por_cadastro on public.itens_nf;
create trigger tg_nf_cubagem_por_cadastro
after insert or update of q_com, c_prod on public.itens_nf
for each row
execute function public.fn_nf_cubagem_por_cadastro();
