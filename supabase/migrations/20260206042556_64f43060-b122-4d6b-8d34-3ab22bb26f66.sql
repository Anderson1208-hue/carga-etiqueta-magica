-- Add explicit authentication check to notas_fiscais
-- Drop existing SELECT policy and recreate with explicit auth check
DROP POLICY IF EXISTS "Authenticated users can view notas fiscais" ON public.notas_fiscais;
CREATE POLICY "Authenticated users can view notas fiscais"
ON public.notas_fiscais
FOR SELECT
TO authenticated
USING (has_profile());

-- Add explicit authentication check to profiles  
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING ((id = auth.uid()) OR is_admin());

-- Add explicit authentication check to itens_nf (contains product codes linked to NFs)
DROP POLICY IF EXISTS "Authenticated users can view itens nf" ON public.itens_nf;
CREATE POLICY "Authenticated users can view itens nf"
ON public.itens_nf
FOR SELECT
TO authenticated
USING (has_profile());

-- Add explicit authentication check to etiquetas (contains NF references)
DROP POLICY IF EXISTS "Authenticated users can view etiquetas" ON public.etiquetas;
CREATE POLICY "Authenticated users can view etiquetas"
ON public.etiquetas
FOR SELECT
TO authenticated
USING (has_profile());

-- Add explicit authentication check to cargas
DROP POLICY IF EXISTS "Authenticated users can view cargas" ON public.cargas;
CREATE POLICY "Authenticated users can view cargas"
ON public.cargas
FOR SELECT
TO authenticated
USING (has_profile());

-- Add explicit authentication check to roteirizacoes (contains delivery routes)
DROP POLICY IF EXISTS "Authenticated users can view roteirizacoes" ON public.roteirizacoes;
CREATE POLICY "Authenticated users can view roteirizacoes"
ON public.roteirizacoes
FOR SELECT
TO authenticated
USING (has_profile());

-- Add explicit authentication check to roteirizacao_paradas (contains addresses)
DROP POLICY IF EXISTS "Authenticated users can view paradas" ON public.roteirizacao_paradas;
CREATE POLICY "Authenticated users can view paradas"
ON public.roteirizacao_paradas
FOR SELECT
TO authenticated
USING (has_profile());