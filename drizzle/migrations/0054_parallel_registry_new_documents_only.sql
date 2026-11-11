CREATE TABLE public.paralelo_entradas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('NF','CTE')),
  fonte_id text NOT NULL,
  cnpj text NOT NULL CHECK (cnpj ~ '^[0-9]{14}$'),
  cliente text NOT NULL CHECK (length(btrim(cliente)) > 0),
  cidade text NOT NULL CHECK (length(btrim(cidade)) > 0),
  uf text NOT NULL CHECK (uf ~ '^[A-Z]{2}$'),
  documento text,
  data_documento date,
  dados jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(dados) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo, fonte_id, cnpj, cidade, uf)
);
GRANT SELECT ON public.paralelo_entradas TO authenticated;
GRANT ALL ON public.paralelo_entradas TO service_role;
ALTER TABLE public.paralelo_entradas ENABLE ROW LEVEL SECURITY;
CREATE POLICY exclusivo_ler ON public.paralelo_entradas FOR SELECT TO authenticated
  USING ((SELECT public.pode_comercial_paralelo()));
CREATE INDEX paralelo_entradas_cliente_data ON public.paralelo_entradas (cnpj, created_at DESC, id DESC);
CREATE INDEX paralelo_entradas_data ON public.paralelo_entradas (created_at DESC, id DESC);
COMMENT ON TABLE public.paralelo_entradas IS 'Somente NFs e CT-es recebidos após 11/11/2026; evidências isoladas para revisão de Anderson, sem efeito operacional ou preenchimento retroativo.';

CREATE FUNCTION public.paralelo_garantir_cliente(p_cnpj text, p_nome text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_cnpj !~ '^[0-9]{14}$' OR nullif(btrim(p_nome), '') IS NULL THEN
    RETURN;
  END IF;
  INSERT INTO public.paralelo_clientes (cnpj, nome, fiscal, observacao, ativo)
  VALUES (
    p_cnpj,
    btrim(p_nome),
    '{"cfop":"","cst":"","aliquota":"","uf_inicio":"","uf_fim":""}'::jsonb,
    'Cliente identificado em documento recebido pelo sistema; revisar cadastro.',
    true
  )
  ON CONFLICT (cnpj) DO NOTHING;
END;
$$;
REVOKE ALL ON FUNCTION public.paralelo_garantir_cliente(text,text) FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.paralelo_capturar_nf()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_cnpj text;
BEGIN
  v_cnpj := regexp_replace(coalesce(NEW.cnpj_emitente, ''), '\D', '', 'g');
  PERFORM public.paralelo_garantir_cliente(v_cnpj, NEW.razao_social_emitente);
  IF v_cnpj ~ '^[0-9]{14}$'
     AND nullif(btrim(NEW.razao_social_emitente), '') IS NOT NULL
     AND nullif(btrim(NEW.dest_cidade), '') IS NOT NULL
     AND upper(btrim(coalesce(NEW.dest_uf, ''))) ~ '^[A-Z]{2}$' THEN
    INSERT INTO public.paralelo_entradas
      (tipo, fonte_id, cnpj, cliente, cidade, uf, documento, data_documento, dados)
    VALUES
      ('NF', NEW.id::text, v_cnpj, btrim(NEW.razao_social_emitente), btrim(NEW.dest_cidade),
       upper(btrim(NEW.dest_uf)), NEW.numero_nf, NEW.data_emissao,
       jsonb_build_object(
         'chave_acesso', NEW.chave_acesso,
         'valor_nf', NEW.valor_nf,
         'peso_bruto', NEW.peso_bruto,
         'volume_m3', NEW.volume_m3,
         'qtd_volumes', NEW.qtd_volumes
       ))
    ON CONFLICT (tipo, fonte_id, cnpj, cidade, uf) DO NOTHING;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Cadastro paralelo não capturou NF %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.paralelo_capturar_nf() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER paralelo_nf_nova
AFTER INSERT ON public.notas_fiscais
FOR EACH ROW EXECUTE FUNCTION public.paralelo_capturar_nf();

CREATE FUNCTION public.paralelo_capturar_cte()
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
      WHERE cnpj ~ '^[0-9]{14}$'
      HAVING count(DISTINCT cnpj) = 1
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
CREATE TRIGGER paralelo_cte_novo
AFTER INSERT ON public.cte_detalhes
FOR EACH ROW EXECUTE FUNCTION public.paralelo_capturar_cte();

-- Deliberadamente sem backfill: somente INSERTs posteriores a esta migração alimentam o cadastro paralelo.