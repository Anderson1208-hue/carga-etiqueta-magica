
CREATE OR REPLACE FUNCTION public.enriquecer_cadastros_fiscais_lote(payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row record;
  v_cnpj_emit text;
  v_cnpj_dest text;
  v_regime text;
  v_emb_atualizados int := 0;
  v_dest_atualizados int := 0;
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'acesso negado';
  END IF;

  FOR v_row IN
    SELECT *
    FROM jsonb_to_recordset(COALESCE(payload->'nfs','[]'::jsonb)) AS x(
      cnpj_emitente text,
      ie_emitente text,
      crt_emitente int,
      uf_emitente text,
      municipio_emitente text,
      codigo_municipio_ibge_emitente text,
      cnpj_destinatario text,
      ie_destinatario text,
      indicador_ie_destinatario int
    )
  LOOP
    v_cnpj_emit := regexp_replace(coalesce(v_row.cnpj_emitente,''), '[^0-9]', '', 'g');
    v_cnpj_dest := regexp_replace(coalesce(v_row.cnpj_destinatario,''), '[^0-9]', '', 'g');

    -- Mapeia CRT (código NF-e) -> regime_tributario textual
    v_regime := CASE v_row.crt_emitente
      WHEN 1 THEN 'simples'
      WHEN 2 THEN 'simples'
      WHEN 3 THEN 'lucro_presumido'  -- pode ser Presumido ou Real; usuário ajusta se preciso
      WHEN 4 THEN 'mei'
      ELSE NULL
    END;

    -- Embarcador: só atualiza campos ainda nulos
    IF length(v_cnpj_emit) = 14 THEN
      UPDATE public.embarcadores
         SET ie                       = COALESCE(ie, NULLIF(v_row.ie_emitente,'')),
             regime_tributario        = COALESCE(regime_tributario, v_regime),
             uf                       = COALESCE(uf, NULLIF(v_row.uf_emitente,'')),
             municipio                = COALESCE(municipio, NULLIF(v_row.municipio_emitente,'')),
             codigo_municipio_ibge    = COALESCE(codigo_municipio_ibge, NULLIF(v_row.codigo_municipio_ibge_emitente,''))
       WHERE cnpj = v_cnpj_emit
         AND (
           (ie IS NULL AND NULLIF(v_row.ie_emitente,'') IS NOT NULL)
           OR (regime_tributario IS NULL AND v_regime IS NOT NULL)
           OR (uf IS NULL AND NULLIF(v_row.uf_emitente,'') IS NOT NULL)
           OR (municipio IS NULL AND NULLIF(v_row.municipio_emitente,'') IS NOT NULL)
           OR (codigo_municipio_ibge IS NULL AND NULLIF(v_row.codigo_municipio_ibge_emitente,'') IS NOT NULL)
         );
      IF FOUND THEN v_emb_atualizados := v_emb_atualizados + 1; END IF;
    END IF;

    -- Destinatário: idem, só campos nulos
    IF length(v_cnpj_dest) >= 11 THEN
      UPDATE public.destinatarios
         SET ie            = COALESCE(ie, NULLIF(v_row.ie_destinatario,'')),
             indicador_ie  = COALESCE(indicador_ie, v_row.indicador_ie_destinatario::smallint)
       WHERE cnpj_cpf = v_cnpj_dest
         AND (
           (ie IS NULL AND NULLIF(v_row.ie_destinatario,'') IS NOT NULL)
           OR (indicador_ie IS NULL AND v_row.indicador_ie_destinatario IS NOT NULL)
         );
      IF FOUND THEN v_dest_atualizados := v_dest_atualizados + 1; END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'status','ok',
    'embarcadores_atualizados', v_emb_atualizados,
    'destinatarios_atualizados', v_dest_atualizados
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.enriquecer_cadastros_fiscais_lote(jsonb) TO authenticated;
