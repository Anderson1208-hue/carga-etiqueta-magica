ALTER TABLE public.notas_fiscais
  ADD COLUMN IF NOT EXISTS baixa_retroativa_em date,
  ADD COLUMN IF NOT EXISTS baixa_retroativa_origem text;

CREATE OR REPLACE FUNCTION public.aplicar_baixa_retroativa(p_rows jsonb, p_dry_run boolean DEFAULT true, p_origem text DEFAULT 'praxio')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidatas int;
  v_atualizadas int := 0;
BEGIN
  CREATE TEMP TABLE _praxio(nf text, dt date) ON COMMIT DROP;
  INSERT INTO _praxio(nf, dt)
  SELECT ltrim(x->>'nf', '0'), (x->>'dt')::date
  FROM jsonb_array_elements(p_rows) x;

  CREATE TEMP TABLE _alvo ON COMMIT DROP AS
  SELECT n.id, max(p.dt) AS dt
  FROM public.notas_fiscais n
  JOIN _praxio p ON ltrim(n.numero_nf, '0') = p.nf
  LEFT JOIN public.baixas_entrega b ON b.nf_id = n.id
  WHERE b.id IS NULL
    AND n.status_entrega IN ('NF EM ROTA', 'PENDENCIA DE BAIXA', 'CARGA NO DEPOSITO')
  GROUP BY n.id;

  SELECT count(*) INTO v_candidatas FROM _alvo;

  IF NOT p_dry_run THEN
    UPDATE public.notas_fiscais n
    SET status_entrega = 'ENTREGUE',
        baixa_retroativa_em = a.dt,
        baixa_retroativa_origem = p_origem
    FROM _alvo a
    WHERE n.id = a.id;
    v_atualizadas := (SELECT count(*) FROM _alvo);
  END IF;

  RETURN jsonb_build_object('candidatas', v_candidatas, 'atualizadas', v_atualizadas, 'dry_run', p_dry_run);
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_baixa_retroativa(jsonb, boolean, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_baixa_retroativa(jsonb, boolean, text) TO service_role;