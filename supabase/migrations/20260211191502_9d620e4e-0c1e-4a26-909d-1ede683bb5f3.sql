
-- Drop existing SELECT policy
DROP POLICY IF EXISTS "Users can view veiculos" ON public.veiculos;

-- Create new SELECT policy that also allows operators assigned to related cargas
CREATE POLICY "Users can view veiculos"
ON public.veiculos
FOR SELECT
USING (
  is_admin()
  OR (created_by = auth.uid())
  OR EXISTS (
    SELECT 1
    FROM veiculo_nfs vnf
    JOIN notas_fiscais nf ON nf.id = vnf.nf_id
    JOIN cargas c ON c.id = nf.carga_id
    WHERE vnf.veiculo_id = veiculos.id
    AND c.operador_responsavel = auth.uid()
  )
);

-- Also update veiculo_nfs SELECT policy so operator can see linked NFs
DROP POLICY IF EXISTS "Users can view veiculo_nfs" ON public.veiculo_nfs;

CREATE POLICY "Users can view veiculo_nfs"
ON public.veiculo_nfs
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM veiculos v
    WHERE v.id = veiculo_nfs.veiculo_id
    AND (
      is_admin()
      OR v.created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM notas_fiscais nf
        JOIN cargas c ON c.id = nf.carga_id
        WHERE nf.id = veiculo_nfs.nf_id
        AND c.operador_responsavel = auth.uid()
      )
    )
  )
);
