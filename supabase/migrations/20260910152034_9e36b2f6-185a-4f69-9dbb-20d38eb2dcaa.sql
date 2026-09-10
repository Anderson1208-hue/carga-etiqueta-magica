create or replace function public.add_dias_uteis(p_base date, p_dias int)
returns date language plpgsql immutable set search_path = public as $$
declare d date := p_base; n int := 0;
begin
  while n < p_dias loop
    d := d + 1;
    if extract(isodow from d) < 6 then n := n + 1; end if;
  end loop;
  return d;
end $$;
revoke all on function public.add_dias_uteis(date, int) from public;
grant execute on function public.add_dias_uteis(date, int) to service_role;