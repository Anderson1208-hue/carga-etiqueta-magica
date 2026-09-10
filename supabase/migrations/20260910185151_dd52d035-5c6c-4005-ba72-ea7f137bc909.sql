CREATE OR REPLACE FUNCTION public.siriuslog_plano(p_de date, p_ate date)
 RETURNS TABLE(numero_nf text, carga_status text, carga_updated text, data_rot text, baixa_entregue text, previsao text, previsao_origem text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
with reg as (
  select cid.uf,
         upper(translate(cid.municipio_norm,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC')) cid,
         max(s.prazo_dias_uteis) prazo
  from embarcador_regioes r
  join embarcador_regiao_cidades cid on cid.regiao_id = r.id
  join embarcador_regiao_sla s on s.regiao_id = r.id and s.ativo
  where r.embarcador_id = 'b503c75d-4058-4ce4-945a-7a307a5fb629' and r.ativo
  group by 1,2
), base as (
  select n.id, n.numero_nf, n.dest_uf, n.dest_cidade, n.created_at,
    c.status as carga_status,
    case when c.status is not null and c.status <> 'fechada'
         then to_char(c.updated_at at time zone 'America/Sao_Paulo','YYYY-MM-DD') end as carga_updated,
    (select min(v.data)::text from veiculo_nfs vn join veiculos v on v.id = vn.veiculo_id
       where vn.nf_id = n.id and v.data <= (now() at time zone 'America/Sao_Paulo')::date) as data_rot,
    (select to_char(max(b.created_at) at time zone 'America/Sao_Paulo','YYYY-MM-DD"T"HH24:MI:SS')
       from baixas_entrega b where b.nf_id = n.id and b.status ilike 'ENTREG%') as baixa_entregue
  from notas_fiscais n
  left join cargas c on c.id = n.carga_id
  where (n.cnpj_emitente like '70940994%' or n.cnpj_emitente like '70.940.994%'
         or n.razao_social_emitente ilike '%pandurata%')
)
select b.numero_nf, b.carga_status, b.carga_updated, b.data_rot, b.baixa_entregue,
  coalesce(
    (select max(a.data_agendamento)::text from agendamentos a where a.nf_id = b.id),
    (select add_dias_uteis((b.created_at at time zone 'America/Sao_Paulo')::date, prazo)::text
       from reg where reg.uf = upper(b.dest_uf)
        and reg.cid = upper(translate(b.dest_cidade,'ÁÀÂÃÉÊÍÓÔÕÚÇáàâãéêíóôõúç','AAAAEEIOOOUCAAAAEEIOOOUC'))
       limit 1)
  ),
  case when exists (select 1 from agendamentos a where a.nf_id = b.id and a.data_agendamento is not null)
       then 'agendamento' else 'lead_time' end
from base b
where greatest(
        (b.created_at at time zone 'America/Sao_Paulo')::date,
        coalesce(b.carga_updated::date, '1900-01-01'::date),
        coalesce(b.data_rot::date, '1900-01-01'::date),
        coalesce(left(b.baixa_entregue,10)::date, '1900-01-01'::date)
      ) between p_de and p_ate
order by b.numero_nf
$function$;