-- 1) Add import_batch_id to cargas for idempotency
ALTER TABLE public.cargas
ADD COLUMN IF NOT EXISTS import_batch_id text;

-- Unique index to prevent duplicated cargas for the same batch (allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS cargas_import_batch_id_uidx
ON public.cargas (import_batch_id)
WHERE import_batch_id IS NOT NULL;

-- 2) RPC to import a carga atomically with duplicate-safe inserts
-- Payload format (jsonb):
-- {
--   "carga": {"motorista": "...", "placa": "...", "observacao": "...", "data": "YYYY-MM-DD", "import_batch_id": "..."},
--   "nfs": [
--     {
--       "chave_acesso": "...",
--       "numero_nf": "...",
--       "cnpj_emitente": "...",
--       "razao_social_emitente": "...",
--       "data_emissao": "YYYY-MM-DD"|null,
--       "cnpj_destinatario": "..."|null,
--       "dest_razao_social": "..."|null,
--       "dest_logradouro": "..."|null,
--       "dest_numero": "..."|null,
--       "dest_bairro": "..."|null,
--       "dest_cidade": "..."|null,
--       "dest_uf": "..."|null,
--       "dest_cep": "..."|null,
--       "itens": [{"c_prod":"...","x_prod":"...","u_com":"...","q_com":0}],
--       "etiquetas": [{"c_prod":"...","x_prod":"...","seq":1,"total":10,"qr_payload":"..."}]
--     }
--   ]
-- }

CREATE OR REPLACE FUNCTION public.importar_carga_xml_lote(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_carga_id uuid;
  v_existing_carga_id uuid;
  v_batch_id text;
  v_total_xml int := 0;
  v_importados int := 0;
  v_duplicados int := 0;
  v_nf record;
  v_nf_id uuid;
  v_nf_inserted boolean;
  v_resumo_duplicados jsonb := '[]'::jsonb;
BEGIN
  v_batch_id := nullif(payload #>> '{carga,import_batch_id}', '');

  -- If a batch id was provided and already exists, return the existing carga and do nothing.
  IF v_batch_id IS NOT NULL THEN
    SELECT id INTO v_existing_carga_id
    FROM public.cargas
    WHERE import_batch_id = v_batch_id
    LIMIT 1;

    IF v_existing_carga_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'already_processed',
        'carga_id', v_existing_carga_id
      );
    END IF;
  END IF;

  -- Create carga inside the transaction
  INSERT INTO public.cargas (motorista, placa, observacao, data, created_by, import_batch_id)
  VALUES (
    payload #>> '{carga,motorista}',
    payload #>> '{carga,placa}',
    NULLIF(payload #>> '{carga,observacao}', ''),
    COALESCE(NULLIF(payload #>> '{carga,data}', '')::date, CURRENT_DATE),
    auth.uid(),
    v_batch_id
  )
  RETURNING id INTO v_carga_id;

  -- Process NFs
  FOR v_nf IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(payload->'nfs','[]'::jsonb)) AS x(
      chave_acesso text,
      numero_nf text,
      cnpj_emitente text,
      razao_social_emitente text,
      data_emissao date,
      cnpj_destinatario text,
      dest_razao_social text,
      dest_logradouro text,
      dest_numero text,
      dest_bairro text,
      dest_cidade text,
      dest_uf text,
      dest_cep text,
      itens jsonb,
      etiquetas jsonb
    )
  LOOP
    v_total_xml := v_total_xml + 1;

    -- Insert NF (ignore duplicates by chave_acesso)
    v_nf_id := NULL;
    v_nf_inserted := false;

    INSERT INTO public.notas_fiscais (
      carga_id,
      chave_acesso,
      numero_nf,
      cnpj_emitente,
      razao_social_emitente,
      data_emissao,
      cnpj_destinatario,
      dest_razao_social,
      dest_logradouro,
      dest_numero,
      dest_bairro,
      dest_cidade,
      dest_uf,
      dest_cep
    )
    VALUES (
      v_carga_id,
      v_nf.chave_acesso,
      v_nf.numero_nf,
      v_nf.cnpj_emitente,
      v_nf.razao_social_emitente,
      v_nf.data_emissao,
      v_nf.cnpj_destinatario,
      v_nf.dest_razao_social,
      v_nf.dest_logradouro,
      v_nf.dest_numero,
      v_nf.dest_bairro,
      v_nf.dest_cidade,
      v_nf.dest_uf,
      v_nf.dest_cep
    )
    ON CONFLICT (chave_acesso) DO NOTHING
    RETURNING id INTO v_nf_id;

    IF v_nf_id IS NULL THEN
      v_duplicados := v_duplicados + 1;
      v_resumo_duplicados := v_resumo_duplicados || jsonb_build_object(
        'numero_nf', v_nf.numero_nf,
        'chave_acesso', v_nf.chave_acesso
      );
      CONTINUE;
    END IF;

    v_importados := v_importados + 1;

    -- Insert items (only for imported NF)
    INSERT INTO public.itens_nf (nf_id, c_prod, x_prod, u_com, q_com)
    SELECT
      v_nf_id,
      i.c_prod,
      i.x_prod,
      i.u_com,
      i.q_com
    FROM jsonb_to_recordset(COALESCE(v_nf.itens,'[]'::jsonb)) AS i(
      c_prod text,
      x_prod text,
      u_com text,
      q_com numeric
    );

    -- Insert etiquetas (only for imported NF)
    INSERT INTO public.etiquetas (
      carga_id,
      nf_id,
      chave_acesso,
      numero_nf,
      c_prod,
      x_prod,
      seq,
      total,
      qr_payload
    )
    SELECT
      v_carga_id,
      v_nf_id,
      v_nf.chave_acesso,
      v_nf.numero_nf,
      e.c_prod,
      e.x_prod,
      e.seq,
      e.total,
      e.qr_payload
    FROM jsonb_to_recordset(COALESCE(v_nf.etiquetas,'[]'::jsonb)) AS e(
      c_prod text,
      x_prod text,
      seq int,
      total int,
      qr_payload text
    );
  END LOOP;

  -- Consistency rule: do not keep empty carga
  IF v_importados = 0 THEN
    DELETE FROM public.cargas WHERE id = v_carga_id;
    RETURN jsonb_build_object(
      'status', 'no_valid_nfs',
      'total_enviados', v_total_xml,
      'importados', v_importados,
      'ignorados_duplicidade', v_duplicados,
      'duplicados', v_resumo_duplicados
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'carga_id', v_carga_id,
    'total_enviados', v_total_xml,
    'importados', v_importados,
    'ignorados_duplicidade', v_duplicados,
    'duplicados', v_resumo_duplicados
  );
END;
$$;

-- Grant execute to authenticated users (RLS still applies on tables)
GRANT EXECUTE ON FUNCTION public.importar_carga_xml_lote(jsonb) TO authenticated;
