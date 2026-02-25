
-- Add volume_m3 column to notas_fiscais
ALTER TABLE public.notas_fiscais ADD COLUMN volume_m3 numeric DEFAULT 0;

-- Allow users to update notas_fiscais (needed for volume upload)
CREATE POLICY "Users can update notas fiscais of accessible cargas"
ON public.notas_fiscais
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM cargas c
    WHERE c.id = notas_fiscais.carga_id
    AND (
      is_admin()
      OR c.created_by = auth.uid()
      OR c.operador_responsavel = auth.uid()
      OR EXISTS (
        SELECT 1 FROM carga_operadores co
        WHERE co.carga_id = c.id AND co.operador_id = auth.uid()
      )
    )
  )
);
