CREATE OR REPLACE FUNCTION public.fn_reentrega_cacau_reabre_expedicao()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_nf record;
  v_ult_reentrega timestamptz;
BEGIN
  SELECT id, numero_nf, cnpj_emitente INTO v_nf FROM public.notas_fiscais WHERE id = NEW.nf_id;
  IF v_nf.id IS NULL THEN RETURN NEW; END IF;

  -- Somente IBAC/IBAE (escopo ativo em cnpj_envio_canhoto_auto)
  IF NOT EXISTS (
    SELECT 1 FROM public.cnpj_envio_canhoto_auto c
    WHERE c.ativo AND c.cnpj = left(regexp_replace(coalesce(v_nf.cnpj_emitente,''), '\D', '', 'g'), 8)
  ) THEN RETURN NEW; END IF;

  -- Reentrega registrada em outro veículo
  SELECT max(b.created_at) INTO v_ult_reentrega
  FROM public.baixas_entrega b
  WHERE b.nf_id = NEW.nf_id AND b.ocorrencia = 'reentrega'
    AND b.veiculo_id IS DISTINCT FROM NEW.veiculo_id;
  IF v_ult_reentrega IS NULL THEN RETURN NEW; END IF;

  -- Reabre para nova bipagem de expedição somente o que foi expedido antes da reentrega
  UPDATE public.etiquetas e
     SET status = 'conferido_interno', conferido_em = NULL, conferido_por = NULL
   WHERE e.carga_id = NEW.carga_origem_id
     AND e.numero_nf = v_nf.numero_nf
     AND e.status = 'conferido'
     AND (e.conferido_em IS NULL OR e.conferido_em < v_ult_reentrega);

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_reentrega_cacau_reabre_expedicao ON public.veiculo_nfs;
CREATE TRIGGER tg_reentrega_cacau_reabre_expedicao
AFTER INSERT ON public.veiculo_nfs
FOR EACH ROW EXECUTE FUNCTION public.fn_reentrega_cacau_reabre_expedicao();