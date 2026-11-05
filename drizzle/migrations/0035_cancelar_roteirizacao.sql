CREATE TABLE public.roteirizacao_cancelamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL,
  placa text NOT NULL,
  motorista text,
  data_rota date NOT NULL,
  motivo text NOT NULL,
  nfs jsonb NOT NULL DEFAULT '[]'::jsonb,
  cancelado_por uuid NOT NULL,
  cancelado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.roteirizacao_cancelamentos TO authenticated;
GRANT ALL ON public.roteirizacao_cancelamentos TO service_role;
ALTER TABLE public.roteirizacao_cancelamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Operadores leem cancelamentos" ON public.roteirizacao_cancelamentos
  FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));
CREATE INDEX idx_rot_cancel_veiculo ON public.roteirizacao_cancelamentos(veiculo_id);

CREATE OR REPLACE FUNCTION public.cancelar_roteirizacao(_veiculo_id uuid, _motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v record;
  _nfs jsonb;
  _qtd int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_active_operator() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF coalesce(length(trim(_motivo)), 0) < 5 THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento (mínimo 5 caracteres)';
  END IF;

  SELECT * INTO v FROM public.veiculos WHERE id = _veiculo_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Veículo não encontrado'; END IF;
  IF v.status = 'cancelada' THEN RAISE EXCEPTION 'Roteirização já cancelada'; END IF;

  -- Em trânsito: rota iniciada/finalizada na Torre de Controle
  IF EXISTS (SELECT 1 FROM public.monitoramento_rotas r
             WHERE r.veiculo_id = _veiculo_id AND r.status IN ('ativa','finalizada')) THEN
    RAISE EXCEPTION 'Veículo em trânsito: a roteirização não pode ser cancelada';
  END IF;
  -- Qualquer baixa registrada também indica que a viagem saiu
  IF EXISTS (SELECT 1 FROM public.baixas_entrega b WHERE b.veiculo_id = _veiculo_id) THEN
    RAISE EXCEPTION 'Veículo já possui baixa de entrega registrada: não pode ser cancelado';
  END IF;
  IF EXISTS (SELECT 1 FROM public.veiculo_nfs vn JOIN public.notas_fiscais n ON n.id = vn.nf_id
             WHERE vn.veiculo_id = _veiculo_id
               AND n.status_entrega IN ('ENTREGUE','RECUSADO','PENDENCIA DE BAIXA')) THEN
    RAISE EXCEPTION 'Há notas entregues, recusadas ou com pendência de baixa neste veículo';
  END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object('nf_id', n.id, 'numero_nf', n.numero_nf,
           'carga_origem_id', vn.carga_origem_id, 'status_entrega', n.status_entrega)
           ORDER BY n.numero_nf), '[]'::jsonb), count(*)
    INTO _nfs, _qtd
  FROM public.veiculo_nfs vn JOIN public.notas_fiscais n ON n.id = vn.nf_id
  WHERE vn.veiculo_id = _veiculo_id;

  INSERT INTO public.roteirizacao_cancelamentos(veiculo_id, placa, motorista, data_rota, motivo, nfs, cancelado_por)
  VALUES (_veiculo_id, v.placa, v.motorista, v.data, trim(_motivo), _nfs, auth.uid());

  -- Notas voltam para Preparação. Conferências, etiquetas, CT-e, MDF-e e SM são preservados.
  UPDATE public.notas_fiscais SET status_entrega = 'CARGA NO DEPOSITO'
   WHERE id IN (SELECT nf_id FROM public.veiculo_nfs WHERE veiculo_id = _veiculo_id)
     AND status_entrega = 'NF EM ROTA';
  DELETE FROM public.veiculo_nfs WHERE veiculo_id = _veiculo_id;

  UPDATE public.monitoramento_rotas SET status = 'cancelada'
   WHERE veiculo_id = _veiculo_id AND status = 'aguardando';
  UPDATE public.veiculos SET status = 'cancelada' WHERE id = _veiculo_id;

  RETURN jsonb_build_object('nfs_liberadas', _qtd, 'placa', v.placa);
END;
$$;
REVOKE ALL ON FUNCTION public.cancelar_roteirizacao(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancelar_roteirizacao(uuid, text) TO authenticated;