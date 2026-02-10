
-- 1. Add new statuses to load_status enum
ALTER TYPE public.load_status ADD VALUE IF NOT EXISTS 'em_rota';
ALTER TYPE public.load_status ADD VALUE IF NOT EXISTS 'entregue';

-- 2. Table: veiculos (programmed vehicles from multi-cargo selection)
CREATE TABLE public.veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  placa text NOT NULL,
  motorista text NOT NULL,
  data date NOT NULL DEFAULT CURRENT_DATE,
  status text NOT NULL DEFAULT 'pendente', -- pendente, em_rota, finalizado
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.veiculos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can create veiculos"
  ON public.veiculos FOR INSERT
  WITH CHECK (has_profile());

CREATE POLICY "Users can view veiculos"
  ON public.veiculos FOR SELECT
  USING (is_admin() OR created_by = auth.uid());

CREATE POLICY "Users can update own veiculos"
  ON public.veiculos FOR UPDATE
  USING (is_admin() OR created_by = auth.uid());

CREATE POLICY "Admins can delete veiculos"
  ON public.veiculos FOR DELETE
  USING (is_admin());

CREATE TRIGGER update_veiculos_updated_at
  BEFORE UPDATE ON public.veiculos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Table: veiculo_nfs (links individual NFs to a vehicle)
CREATE TABLE public.veiculo_nfs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  nf_id uuid NOT NULL REFERENCES public.notas_fiscais(id),
  carga_origem_id uuid NOT NULL REFERENCES public.cargas(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(nf_id) -- each NF can only be in one vehicle
);

ALTER TABLE public.veiculo_nfs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can create veiculo_nfs"
  ON public.veiculo_nfs FOR INSERT
  WITH CHECK (has_profile());

CREATE POLICY "Users can view veiculo_nfs"
  ON public.veiculo_nfs FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.veiculos v
    WHERE v.id = veiculo_nfs.veiculo_id
    AND (is_admin() OR v.created_by = auth.uid())
  ));

CREATE POLICY "Users can delete veiculo_nfs"
  ON public.veiculo_nfs FOR DELETE
  USING (EXISTS (
    SELECT 1 FROM public.veiculos v
    WHERE v.id = veiculo_nfs.veiculo_id
    AND (is_admin() OR v.created_by = auth.uid())
  ));

CREATE POLICY "Admins can update veiculo_nfs"
  ON public.veiculo_nfs FOR UPDATE
  USING (is_admin());

-- 4. Storage bucket for delivery proof photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('comprovantes', 'comprovantes', false);

-- Storage policies: only authenticated users can upload/view their own proofs
CREATE POLICY "Users can upload comprovantes"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'comprovantes' AND auth.role() = 'authenticated');

CREATE POLICY "Users can view comprovantes"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'comprovantes' AND auth.role() = 'authenticated');

-- 5. Table: baixas_entrega (delivery confirmations with photo + occurrence)
CREATE TABLE public.baixas_entrega (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  veiculo_id uuid NOT NULL REFERENCES public.veiculos(id) ON DELETE CASCADE,
  nf_id uuid NOT NULL REFERENCES public.notas_fiscais(id),
  status text NOT NULL DEFAULT 'pendente', -- pendente, entregue, recusado, nao_encontrado, parcial
  foto_path text, -- storage path in comprovantes bucket
  ocorrencia text, -- free text for driver notes
  recebedor_nome text,
  latitude numeric,
  longitude numeric,
  registrado_por uuid REFERENCES auth.users(id),
  registrado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.baixas_entrega ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can create baixas"
  ON public.baixas_entrega FOR INSERT
  WITH CHECK (has_profile());

CREATE POLICY "Users can view baixas of own veiculos"
  ON public.baixas_entrega FOR SELECT
  USING (EXISTS (
    SELECT 1 FROM public.veiculos v
    WHERE v.id = baixas_entrega.veiculo_id
    AND (is_admin() OR v.created_by = auth.uid() OR baixas_entrega.registrado_por = auth.uid())
  ));

CREATE POLICY "Users can update own baixas"
  ON public.baixas_entrega FOR UPDATE
  USING (is_admin() OR registrado_por = auth.uid());

CREATE POLICY "Admins can delete baixas"
  ON public.baixas_entrega FOR DELETE
  USING (is_admin());

CREATE TRIGGER update_baixas_entrega_updated_at
  BEFORE UPDATE ON public.baixas_entrega
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
