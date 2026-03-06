
-- Add 'ativo' column to profiles (new operators default to false)
ALTER TABLE public.profiles ADD COLUMN ativo boolean NOT NULL DEFAULT false;

-- Set all existing operators as active
UPDATE public.profiles SET ativo = true;

-- Create helper function to check if user is active
CREATE OR REPLACE FUNCTION public.is_active_operator()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND ativo = true
  )
$$;

-- Update RLS on cargas: active operators see all cargas
DROP POLICY IF EXISTS "Users can view assigned cargas or all if admin" ON public.cargas;
CREATE POLICY "Users can view cargas" ON public.cargas
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

DROP POLICY IF EXISTS "Users can update assigned cargas" ON public.cargas;
CREATE POLICY "Users can update cargas" ON public.cargas
FOR UPDATE TO authenticated
USING (is_admin() OR is_active_operator());

-- Update RLS on notas_fiscais: active operators see all
DROP POLICY IF EXISTS "Users can view notas fiscais of accessible cargas" ON public.notas_fiscais;
CREATE POLICY "Users can view notas fiscais" ON public.notas_fiscais
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

DROP POLICY IF EXISTS "Users can update notas fiscais of accessible cargas" ON public.notas_fiscais;
CREATE POLICY "Users can update notas fiscais" ON public.notas_fiscais
FOR UPDATE TO authenticated
USING (is_admin() OR is_active_operator());

-- Update RLS on etiquetas: active operators see all
DROP POLICY IF EXISTS "Users can view etiquetas of accessible cargas" ON public.etiquetas;
CREATE POLICY "Users can view etiquetas" ON public.etiquetas
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

DROP POLICY IF EXISTS "Users can update etiquetas of accessible cargas" ON public.etiquetas;
CREATE POLICY "Users can update etiquetas" ON public.etiquetas
FOR UPDATE TO authenticated
USING (is_admin() OR is_active_operator());

-- Update RLS on itens_nf
DROP POLICY IF EXISTS "Users can view itens of accessible notas fiscais" ON public.itens_nf;
CREATE POLICY "Users can view itens_nf" ON public.itens_nf
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

-- Update RLS on roteirizacoes
DROP POLICY IF EXISTS "Users can view roteirizacoes of accessible cargas" ON public.roteirizacoes;
CREATE POLICY "Users can view roteirizacoes" ON public.roteirizacoes
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

DROP POLICY IF EXISTS "Users can update roteirizacoes of accessible cargas" ON public.roteirizacoes;
CREATE POLICY "Users can update roteirizacoes" ON public.roteirizacoes
FOR UPDATE TO authenticated
USING (is_admin() OR is_active_operator());

-- Update RLS on roteirizacao_paradas
DROP POLICY IF EXISTS "Users can view paradas of accessible roteirizacoes" ON public.roteirizacao_paradas;
CREATE POLICY "Users can view paradas" ON public.roteirizacao_paradas
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

DROP POLICY IF EXISTS "Users can update paradas of accessible roteirizacoes" ON public.roteirizacao_paradas;
CREATE POLICY "Users can update paradas" ON public.roteirizacao_paradas
FOR UPDATE TO authenticated
USING (is_admin() OR is_active_operator());

-- Update RLS on agendamentos
DROP POLICY IF EXISTS "Users can view agendamentos of accessible NFs" ON public.agendamentos;
CREATE POLICY "Users can view agendamentos" ON public.agendamentos
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

DROP POLICY IF EXISTS "Users can update agendamentos of accessible NFs" ON public.agendamentos;
CREATE POLICY "Users can update agendamentos" ON public.agendamentos
FOR UPDATE TO authenticated
USING (is_admin() OR is_active_operator());

-- Update RLS on veiculo_nfs
DROP POLICY IF EXISTS "Users can view veiculo_nfs" ON public.veiculo_nfs;
CREATE POLICY "Users can view veiculo_nfs" ON public.veiculo_nfs
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

-- Update RLS on veiculos
DROP POLICY IF EXISTS "Users can view veiculos" ON public.veiculos;
CREATE POLICY "Users can view veiculos" ON public.veiculos
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());

DROP POLICY IF EXISTS "Users can update own veiculos" ON public.veiculos;
CREATE POLICY "Users can update veiculos" ON public.veiculos
FOR UPDATE TO authenticated
USING (is_admin() OR is_active_operator());

-- Update RLS on baixas_entrega
DROP POLICY IF EXISTS "Users can view baixas of own veiculos" ON public.baixas_entrega;
CREATE POLICY "Users can view baixas" ON public.baixas_entrega
FOR SELECT TO authenticated
USING (is_admin() OR is_active_operator());
