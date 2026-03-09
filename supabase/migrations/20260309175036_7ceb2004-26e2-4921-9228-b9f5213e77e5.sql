
CREATE OR REPLACE FUNCTION public.adicionar_nfs_carga(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_carga_id uuid;
  v_total_xml int := 0;
  v_importados int := 0;
  v_duplicados int := 0;
  v_nf record;
  v_nf_id uuid;
  v_resumo_duplicados jsonb := '[]'::jsonb;
BEGIN
  v_carga_id := (payload->>'carga_id')::uuid;

  -- Verify carga exists
  IF NOT EXISTS (SELECT 1 FROM public.cargas WHERE id = v_carga_id) THEN
    RETURN jsonb_build_object('status', 'error', 'message', 'Carga não encontrada');
  END IF;

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
      peso_bruto numeric,
      peso_liquido numeric,
      itens jsonb,
      etiquetas jsonb
    )
  LOOP
    v_total_xml := v_total_xml + 1;
    v_nf_id := NULL;

    INSERT INTO public.notas_fiscais (
      carga_id, chave_acesso, numero_nf, cnpj_emitente, razao_social_emitente,
      data_emissao, cnpj_destinatario, dest_razao_social, dest_logradouro,
      dest_numero, dest_bairro, dest_cidade, dest_uf, dest_cep,
      peso_bruto, peso_liquido
    )
    VALUES (
      v_carga_id, v_nf.chave_acesso, v_nf.numero_nf, v_nf.cnpj_emitente,
      v_nf.razao_social_emitente, v_nf.data_emissao, v_nf.cnpj_destinatario,
      v_nf.dest_razao_social, v_nf.dest_logradouro, v_nf.dest_numero,
      v_nf.dest_bairro, v_nf.dest_cidade, v_nf.dest_uf, v_nf.dest_cep,
      COALESCE(v_nf.peso_bruto, 0), COALESCE(v_nf.peso_liquido, 0)
    )
    ON CONFLICT (chave_acesso) DO NOTHING
    RETURNING id INTO v_nf_id;

    IF v_nf_id IS NULL THEN
      v_duplicados := v_duplicados + 1;
      v_resumo_duplicados := v_resumo_duplicados || jsonb_build_object(
        'numero_nf', v_nf.numero_nf, 'chave_acesso', v_nf.chave_acesso
      );
      CONTINUE;
    END IF;

    v_importados := v_importados + 1;

    INSERT INTO public.itens_nf (nf_id, c_prod, x_prod, u_com, q_com)
    SELECT v_nf_id, i.c_prod, i.x_prod, i.u_com, i.q_com
    FROM jsonb_to_recordset(COALESCE(v_nf.itens,'[]'::jsonb)) AS i(
      c_prod text, x_prod text, u_com text, q_com numeric
    );

    INSERT INTO public.etiquetas (
      carga_id, nf_id, chave_acesso, numero_nf, c_prod, x_prod, seq, total, qr_payload
    )
    SELECT
      v_carga_id, v_nf_id, v_nf.chave_acesso, v_nf.numero_nf,
      e.c_prod, e.x_prod, e.seq, e.total,
      REPLACE(e.qr_payload, '{CARGA_ID}', v_carga_id::text)
    FROM jsonb_to_recordset(COALESCE(v_nf.etiquetas,'[]'::jsonb)) AS e(
      c_prod text, x_prod text, seq int, total int, qr_payload text
    );
  END LOOP;

  RETURN jsonb_build_object(
    'status', CASE WHEN v_importados > 0 THEN 'ok' ELSE 'no_valid_nfs' END,
    'carga_id', v_carga_id,
    'total_enviados', v_total_xml,
    'importados', v_importados,
    'ignorados_duplicidade', v_duplicados,
    'duplicados', v_resumo_duplicados
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.adicionar_nfs_carga(jsonb) TO authenticated;
