create or replace function public.fn_reagenda_reabre_recusada()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.status in ('AGENDAMENTO','REENTREGA') then
    update notas_fiscais nf set status_entrega='CARGA NO DEPOSITO'
     where nf.id=new.nf_id and nf.status_entrega='RECUSADO'
       and not exists (select 1 from veiculo_nfs v where v.nf_id=nf.id);
  end if;
  return new;
end $$;
revoke all on function public.fn_reagenda_reabre_recusada() from public, anon, authenticated;
drop trigger if exists trg_reagenda_reabre_recusada on public.agendamentos;
create trigger trg_reagenda_reabre_recusada after insert on public.agendamentos
for each row execute function public.fn_reagenda_reabre_recusada();