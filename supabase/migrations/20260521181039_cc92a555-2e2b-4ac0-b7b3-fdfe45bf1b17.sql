DROP POLICY IF EXISTS "Users can update own baixas" ON public.baixas_entrega;

CREATE POLICY "Operators can update baixas"
ON public.baixas_entrega
FOR UPDATE
USING (is_admin() OR is_active_operator() OR registrado_por = auth.uid());