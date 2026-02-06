-- Add assignment field to cargas table
ALTER TABLE public.cargas 
ADD COLUMN IF NOT EXISTS operador_responsavel uuid REFERENCES auth.users(id);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_cargas_operador_responsavel ON public.cargas(operador_responsavel);

-- Update RLS policies for cargas - operators see only their assigned cargas, admins see all
DROP POLICY IF EXISTS "Authenticated users can view cargas" ON public.cargas;
CREATE POLICY "Users can view assigned cargas or all if admin"
ON public.cargas
FOR SELECT
TO authenticated
USING (
  is_admin() OR 
  created_by = auth.uid() OR 
  operador_responsavel = auth.uid()
);

DROP POLICY IF EXISTS "Authenticated users can update cargas" ON public.cargas;
CREATE POLICY "Users can update assigned cargas"
ON public.cargas
FOR UPDATE
TO authenticated
USING (
  is_admin() OR 
  created_by = auth.uid() OR 
  operador_responsavel = auth.uid()
);

-- Update RLS for notas_fiscais - based on carga access
DROP POLICY IF EXISTS "Authenticated users can view notas fiscais" ON public.notas_fiscais;
CREATE POLICY "Users can view notas fiscais of accessible cargas"
ON public.notas_fiscais
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cargas c 
    WHERE c.id = notas_fiscais.carga_id 
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid())
  )
);

-- Update RLS for itens_nf - based on NF access
DROP POLICY IF EXISTS "Authenticated users can view itens nf" ON public.itens_nf;
CREATE POLICY "Users can view itens of accessible notas fiscais"
ON public.itens_nf
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.notas_fiscais nf
    JOIN public.cargas c ON c.id = nf.carga_id
    WHERE nf.id = itens_nf.nf_id
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid())
  )
);

-- Update RLS for etiquetas - based on carga access
DROP POLICY IF EXISTS "Authenticated users can view etiquetas" ON public.etiquetas;
CREATE POLICY "Users can view etiquetas of accessible cargas"
ON public.etiquetas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cargas c 
    WHERE c.id = etiquetas.carga_id 
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated users can update etiquetas status" ON public.etiquetas;
CREATE POLICY "Users can update etiquetas of accessible cargas"
ON public.etiquetas
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cargas c 
    WHERE c.id = etiquetas.carga_id 
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid())
  )
);

-- Update RLS for roteirizacoes - based on carga access
DROP POLICY IF EXISTS "Authenticated users can view roteirizacoes" ON public.roteirizacoes;
CREATE POLICY "Users can view roteirizacoes of accessible cargas"
ON public.roteirizacoes
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cargas c 
    WHERE c.id = roteirizacoes.carga_id 
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated users can update roteirizacoes" ON public.roteirizacoes;
CREATE POLICY "Users can update roteirizacoes of accessible cargas"
ON public.roteirizacoes
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.cargas c 
    WHERE c.id = roteirizacoes.carga_id 
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid())
  )
);

-- Update RLS for roteirizacao_paradas - based on roteirizacao access
DROP POLICY IF EXISTS "Authenticated users can view paradas" ON public.roteirizacao_paradas;
CREATE POLICY "Users can view paradas of accessible roteirizacoes"
ON public.roteirizacao_paradas
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.roteirizacoes r
    JOIN public.cargas c ON c.id = r.carga_id
    WHERE r.id = roteirizacao_paradas.roteirizacao_id
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid())
  )
);

DROP POLICY IF EXISTS "Authenticated users can update paradas" ON public.roteirizacao_paradas;
CREATE POLICY "Users can update paradas of accessible roteirizacoes"
ON public.roteirizacao_paradas
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.roteirizacoes r
    JOIN public.cargas c ON c.id = r.carga_id
    WHERE r.id = roteirizacao_paradas.roteirizacao_id
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid())
  )
);