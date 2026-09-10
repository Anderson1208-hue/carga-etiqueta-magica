create or replace function public.add_dias_uteis(p_base date, p_dias int)
returns date language plpgsql immutable as $$
declare d date := p_base; n int := 0;
begin
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;

create or replace function public.siriuslog_plano(p_de date, p_ate date)
returns table (
  numero_nf text,
  carga_status text,
  carga_updated text,
  data_rot text,
  baixa_entregue text,
  previsao text,
  previsao_origem text
)
language sql stable security definer set search_path = public as $$
with reg as (
  select cid.uf,
         upper(translate(cid.municipio_norm,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC')) cid,
         max(s.prazo_dias_uteis) prazo
  from embarcador_regioes r
  join embarcador_regiao_cidades cid on cid.regiao_id = r.id
  join embarcador_regiao_sla s on s.regiao_id = r.id and s.ativo
  where r.embarcador_id = 'b503c75d-4058-4ce4-945a-7a307a5fb629' and r.ativo
  group by 1,2
)
select n.numero_nf,
  c.status,
  case when c.status is not null and c.status <> 'fechada' then to_char(c.updated_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') end,
  (select min(v.data)::text from veiculo_nfs vn join veiculos v on v.id = vn.veiculo_id
     where vn.nf_id = n.id and v.data <= (now() at time zone 'America/Sao_Paulo')::date),
  (select to_char(max(b.created_at) at time zone 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS')
     from baixas_entrega b where b.nf_id = n.id and b.status ilike 'ENTREG%'),
  coalesce(
    (select max(a.data_agendamento)::text from agendamentos a where a.nf_id = n.id),
    (select add_dias_uteis((n.created_at at time zone 'America/Sao_Paulo')::date, prazo)::text
       from reg where reg.uf = upper(n.dest_uf)
        and reg.cid = upper(translate(n.dest_cidade,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC'))
       limit 1)
  ),
  case when exists (select 1 from agendamentos a where a.nf_id = n.id and a.data_agendamento is not null)
       then 'agendamento' else 'lead_time' end
from notas_fiscais n
left join cargas c on c.id = n.carga_id
where (n.cnpj_emitente like '70940994%' or n.cnpj_emitente like '70.940.994%'
       or n.razao_social_emitente ilike '%pandurata%')
  and (n.created_at at time zone 'America/Sao_Paulo')::date between p_de and p_ate
order by n.numero_nf
$$;

revoke all on function public.siriuslog_plano(date, date) from public;
grant execute on function public.siriuslog_plano(date, date) to service_role;
grant execute on function public.add_dias_uteis(date, int) to service_role;