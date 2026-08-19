with alvo as (
  select id, payload->>'numero_nf' nf, created_at,
         row_number() over (partition by payload->>'numero_nf' order by created_at desc) rn
  from public.ibac_eventos_queue
  where evento_interno = 'entrega_realizada'
    and status = 'pendente'
    and (payload->>'numero_nf') = any (
      select unnest(whitelist_nfs) from public.ibac_config_envio where id = true
    )
)
update public.ibac_eventos_queue q
set status = 'cancelado',
    erro_mensagem = 'Duplicado — mantido apenas o evento mais recente da NF (teste CBL1702 19/08/2026)'
from alvo a
where q.id = a.id and a.rn > 1;