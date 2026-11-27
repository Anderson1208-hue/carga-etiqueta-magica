ALTER TABLE public.pandurata_otm_cargas ADD COLUMN excluida_em timestamptz, ADD COLUMN excluida_por uuid, ADD COLUMN motivo_exclusao text;
CREATE OR REPLACE FUNCTION public.excluir_carga_pendente_pandurata(_id uuid, _motivo text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_active_operator() THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF length(trim(coalesce(_motivo,''))) < 3 THEN RAISE EXCEPTION 'Informe o motivo'; END IF;
  UPDATE public.pandurata_otm_cargas SET excluida_em = now(), excluida_por = auth.uid(), motivo_exclusao = left(trim(_motivo), 300)
  WHERE id = _id AND ordem_coleta_id IS NULL AND excluida_em IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carga não encontrada, já excluída ou com ordem de coleta'; END IF;
END $$;
REVOKE EXECUTE ON FUNCTION public.excluir_carga_pendente_pandurata(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.excluir_carga_pendente_pandurata(uuid, text) TO authenticated;