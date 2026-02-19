
-- Junction table for multiple operators per carga
CREATE TABLE public.carga_operadores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  carga_id uuid NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  operador_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(carga_id, operador_id)
);

-- Enable RLS
ALTER TABLE public.carga_operadores ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can manage carga_operadores"
ON public.carga_operadores FOR ALL
USING (is_admin());

CREATE POLICY "Operators can view own assignments"
ON public.carga_operadores FOR SELECT
USING (operador_id = auth.uid());

-- Migrate existing data: copy operador_responsavel to junction table
INSERT INTO public.carga_operadores (carga_id, operador_id)
SELECT id, operador_responsavel
FROM public.cargas
WHERE operador_responsavel IS NOT NULL
ON CONFLICT DO NOTHING;

-- Helper function to check if user is assigned to a carga (via junction table OR legacy column)
CREATE OR REPLACE FUNCTION public.is_carga_operator(p_carga_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM cargas c
    WHERE c.id = p_carga_id
    AND (
      c.created_by = auth.uid()
      OR c.operador_responsavel = auth.uid()
      OR EXISTS (
        SELECT 1 FROM carga_operadores co
        WHERE co.carga_id = p_carga_id AND co.operador_id = auth.uid()
      )
    )
  )
$$;

-- Update RLS on cargas to include junction table
DROP POLICY IF EXISTS "Users can view assigned cargas or all if admin" ON public.cargas;
CREATE POLICY "Users can view assigned cargas or all if admin"
ON public.cargas FOR SELECT
USING (
  is_admin()
  OR created_by = auth.uid()
  OR operador_responsavel = auth.uid()
  OR EXISTS (
    SELECT 1 FROM carga_operadores co
    WHERE co.carga_id = cargas.id AND co.operador_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Users can update assigned cargas" ON public.cargas;
CREATE POLICY "Users can update assigned cargas"
ON public.cargas FOR UPDATE
USING (
  is_admin()
  OR created_by = auth.uid()
  OR operador_responsavel = auth.uid()
  OR EXISTS (
    SELECT 1 FROM carga_operadores co
    WHERE co.carga_id = cargas.id AND co.operador_id = auth.uid()
  )
);

-- Update RLS on notas_fiscais
DROP POLICY IF EXISTS "Users can view notas fiscais of accessible cargas" ON public.notas_fiscais;
CREATE POLICY "Users can view notas fiscais of accessible cargas"
ON public.notas_fiscais FOR SELECT
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

-- Update RLS on etiquetas
DROP POLICY IF EXISTS "Users can view etiquetas of accessible cargas" ON public.etiquetas;
CREATE POLICY "Users can view etiquetas of accessible cargas"
ON public.etiquetas FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM cargas c
    WHERE c.id = etiquetas.carga_id
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

DROP POLICY IF EXISTS "Users can update etiquetas of accessible cargas" ON public.etiquetas;
CREATE POLICY "Users can update etiquetas of accessible cargas"
ON public.etiquetas FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM cargas c
    WHERE c.id = etiquetas.carga_id
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

-- Update RLS on itens_nf
DROP POLICY IF EXISTS "Users can view itens of accessible notas fiscais" ON public.itens_nf;
CREATE POLICY "Users can view itens of accessible notas fiscais"
ON public.itens_nf FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM notas_fiscais nf
    JOIN cargas c ON c.id = nf.carga_id
    WHERE nf.id = itens_nf.nf_id
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

-- Update RLS on roteirizacoes
DROP POLICY IF EXISTS "Users can view roteirizacoes of accessible cargas" ON public.roteirizacoes;
CREATE POLICY "Users can view roteirizacoes of accessible cargas"
ON public.roteirizacoes FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM cargas c
    WHERE c.id = roteirizacoes.carga_id
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

DROP POLICY IF EXISTS "Users can update roteirizacoes of accessible cargas" ON public.roteirizacoes;
CREATE POLICY "Users can update roteirizacoes of accessible cargas"
ON public.roteirizacoes FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM cargas c
    WHERE c.id = roteirizacoes.carga_id
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

-- Update RLS on roteirizacao_paradas
DROP POLICY IF EXISTS "Users can view paradas of accessible roteirizacoes" ON public.roteirizacao_paradas;
CREATE POLICY "Users can view paradas of accessible roteirizacoes"
ON public.roteirizacao_paradas FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM roteirizacoes r
    JOIN cargas c ON c.id = r.carga_id
    WHERE r.id = roteirizacao_paradas.roteirizacao_id
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

DROP POLICY IF EXISTS "Users can update paradas of accessible roteirizacoes" ON public.roteirizacao_paradas;
CREATE POLICY "Users can update paradas of accessible roteirizacoes"
ON public.roteirizacao_paradas FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM roteirizacoes r
    JOIN cargas c ON c.id = r.carga_id
    WHERE r.id = roteirizacao_paradas.roteirizacao_id
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
