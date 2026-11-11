CREATE OR REPLACE FUNCTION public.paralelo_capturar_cte()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v record;
BEGIN
  FOR v IN
    WITH notas AS (
      SELECT DISTINCT
        regexp_replace(coalesce(nf.cnpj_emitente, ''), '\D', '', 'g') AS cnpj,
        btrim(nf.razao_social_emitente) AS cliente,
        coalesce(nullif(btrim(NEW.municipio_fim), ''), nullif(btrim(nf.dest_cidade), '')) AS cidade,
        upper(coalesce(nullif(btrim(NEW.uf_fim), ''), nullif(btrim(nf.dest_uf), ''), '')) AS uf
      FROM public.ctes c
      JOIN public.notas_fiscais nf ON nf.id = c.nf_id
      WHERE c.chave_cte = NEW.chave_cte
    ), cliente_unico AS (
      SELECT min(cnpj) AS cnpj
      FROM notas
      HAVING count(DISTINCT cnpj) = 1 AND min(cnpj) ~ '^[0-9]{14}$'
    )
    SELECT n.*
    FROM notas n
    JOIN cliente_unico u ON u.cnpj = n.cnpj
    WHERE n.cliente <> '' AND n.cidade IS NOT NULL AND n.uf ~ '^[A-Z]{2}$'
  LOOP
    PERFORM public.paralelo_garantir_cliente(v.cnpj, v.cliente);
    INSERT INTO public.paralelo_entradas
      (tipo, fonte_id, cnpj, cliente, cidade, uf, documento, data_documento, dados)
    VALUES
      ('CTE', NEW.chave_cte, v.cnpj, v.cliente, v.cidade, v.uf, NEW.numero_cte, NEW.data_emissao,
       jsonb_build_object(
         'numero_cte', NEW.numero_cte,
         'cfop', NEW.cfop,
         'icms', NEW.icms,
         'componentes', NEW.componentes,
         'quantidades', NEW.quantidades,
         'valor_carga', NEW.valor_carga,
         'valor_total_prestacao', NEW.valor_total_prestacao
       ))
    ON CONFLICT (tipo, fonte_id, cnpj, cidade, uf) DO NOTHING;
  END LOOP;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Cadastro paralelo não capturou CT-e %: %', NEW.chave_cte, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.paralelo_capturar_cte() FROM PUBLIC, anon, authenticated;