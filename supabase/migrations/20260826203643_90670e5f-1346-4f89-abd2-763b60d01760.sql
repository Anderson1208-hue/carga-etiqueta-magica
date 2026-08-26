CREATE OR REPLACE FUNCTION public.canhoto_prazo_vencido(p_marcado_em timestamptz, p_dias_uteis integer DEFAULT 2)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_marcado_em IS NULL THEN false
    ELSE (
      SELECT count(*) >= p_dias_uteis
      FROM generate_series(
        (p_marcado_em AT TIME ZONE 'America/Sao_Paulo')::date + 1,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date,
        interval '1 day'
      ) d
      WHERE extract(isodow FROM d) < 6
    )
  END;
$$;