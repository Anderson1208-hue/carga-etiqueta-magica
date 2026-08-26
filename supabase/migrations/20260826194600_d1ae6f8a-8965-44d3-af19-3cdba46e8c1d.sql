create or replace function public.pode_ver_ibac()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.ativo = true
      and lower(p.email) in ('fabiana.souza@tlmlogistica.com.br','julio.nogueira@tlmlogistica.com.br')
  )
$$;

drop policy if exists "IBAC autorizados leem log" on public.ibac_log_envios;
create policy "IBAC autorizados leem log" on public.ibac_log_envios
  for select to authenticated using (public.pode_ver_ibac());

drop policy if exists "IBAC autorizados leem config envio" on public.ibac_config_envio;
create policy "IBAC autorizados leem config envio" on public.ibac_config_envio
  for select to authenticated using (public.pode_ver_ibac());

drop policy if exists "IBAC autorizados leem config retry" on public.ibac_config_retry;
create policy "IBAC autorizados leem config retry" on public.ibac_config_retry
  for select to authenticated using (public.pode_ver_ibac());

drop policy if exists "IBAC autorizados leem config alertas" on public.ibac_config_alertas;
create policy "IBAC autorizados leem config alertas" on public.ibac_config_alertas
  for select to authenticated using (public.pode_ver_ibac());

grant select on public.ibac_log_envios to authenticated;
grant select on public.ibac_config_envio to authenticated;
grant select on public.ibac_config_retry to authenticated;
grant select on public.ibac_config_alertas to authenticated;
grant select on public.ibac_eventos_queue to authenticated;
grant select on public.ibac_de_para_eventos to authenticated;