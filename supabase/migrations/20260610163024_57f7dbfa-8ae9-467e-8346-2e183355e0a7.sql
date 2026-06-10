CREATE OR REPLACE FUNCTION public.tg_nfev_cte()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_nf record;
BEGIN
  -- Casa por chave_acesso da NF; se faltar, casa por numero_nf normalizado dentro da mesma carga
  FOR v_nf IN
    SELECT nf.id
      FROM public.notas_fiscais nf
     WHERE (NEW.chave_nf_referenciada IS NOT NULL
             AND nf.chave_acesso = NEW.chave_nf_referenciada)
        OR (NEW.numero_nf_referenciada IS NOT NULL
             AND NEW.carga_id IS NOT NULL
             AND nf.carga_id = NEW.carga_id
             AND ltrim(nf.numero_nf,'0') = ltrim(NEW.numero_nf_referenciada,'0'))
  LOOP
    PERFORM public.fn_nfev_insert(
      v_nf.id, 'cte_vinculado',
      COALESCE(NEW.data_emissao::timestamptz, NEW.created_at),
      NULL, NULL,
      jsonb_build_object('cte_id', NEW.id, 'tipo_documento', NEW.tipo_documento,
                         'numero_cte', NEW.numero_cte, 'chave_cte', NEW.chave_cte,
                         'cnpj_emitente', NEW.cnpj_emitente, 'razao_social', NEW.razao_social_emitente,
                         'valor_frete', NEW.valor_frete,
                         'data_emissao', NEW.data_emissao),
      'trigger', 'cte:'||NEW.id::text||':'||v_nf.id::text
    );
  END LOOP;
  RETURN NEW;
END $function$