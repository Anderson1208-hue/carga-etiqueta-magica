
-- Create security definer function to check if user has access to a veiculo
CREATE OR REPLACE FUNCTION public.can_view_veiculo(p_veiculo_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM veiculo_nfs vnf
    JOIN notas_fiscais nf ON nf.id = vnf.nf_id
    JOIN cargas c ON c.id = nf.carga_id
    WHERE vnf.veiculo_id = p_veiculo_id
    AND (c.operador_responsavel = auth.uid() OR c.created_by = auth.uid())
  )
$$;

-- Drop and recreate veiculos SELECT policy using the function
DROP POLICY IF EXISTS "Users can view veiculos" ON public.veiculos;

CREATE POLICY "Users can view veiculos"
ON public.veiculos
FOR SELECT
USING (
  is_admin()
  OR created_by = auth.uid()
  OR can_view_veiculo(id)
);

-- Also fix veiculo_nfs SELECT policy to avoid nested recursion
DROP POLICY IF EXISTS "Users can view veiculo_nfs" ON public.veiculo_nfs;

CREATE POLICY "Users can view veiculo_nfs"
ON public.veiculo_nfs
FOR SELECT
USING (
  is_admin()
  OR EXISTS (
    SELECT 1 FROM cargas c
    JOIN notas_fiscais nf ON nf.carga_id = c.id
    WHERE nf.id = veiculo_nfs.nf_id
    AND (c.created_by = auth.uid() OR c.operador_responsavel = auth.uid())
  )
);
