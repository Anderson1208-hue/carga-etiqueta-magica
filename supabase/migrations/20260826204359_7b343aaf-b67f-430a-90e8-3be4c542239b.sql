CREATE OR REPLACE FUNCTION public.listar_canhotos_pendentes()
RETURNS TABLE(
  baixa_id uuid,
  nf_id uuid,
  numero_nf text,
  dest_razao_social text,
  dest_cidade text,
  veiculo_id uuid,
  placa text,
  motorista text,
  data_rota date,
  registrado_em timestamptz,
  ocorrencia text,
  motivo text,
  observacao text,
  marcado_em timestamptz,
  marcado_por_nome text,
  dias_corridos integer,
  prazo_vencido boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_admin() OR public.is_active_operator()) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;

  RETURN QUERY
  SELECT
    b.id,
    b.nf_id,
    n.numero_nf,
    n.dest_razao_social,
    n.dest_cidade,
    b.veiculo_id,
    v.placa,
    v.motorista,
    v.data,
    b.registrado_em,
    b.ocorrencia,
    b.canhoto_pendente_motivo,
    b.canhoto_pendente_obs,
    b.canhoto_pendente_em,
    coalesce(p.full_name, p.email),
    greatest(0, (((now() AT TIME ZONE 'America/Sao_Paulo')::date) - ((b.canhoto_pendente_em AT TIME ZONE 'America/Sao_Paulo')::date)))::integer,
    public.canhoto_prazo_vencido(b.canhoto_pendente_em)
  FROM public.baixas_entrega b
  JOIN public.notas_fiscais n ON n.id = b.nf_id
  LEFT JOIN public.veiculos v ON v.id = b.veiculo_id
  LEFT JOIN public.profiles p ON p.id = b.canhoto_pendente_por
  WHERE b.conferencia_status = 'canhoto_pendente'
  ORDER BY b.canhoto_pendente_em NULLS LAST;
END;
$$;