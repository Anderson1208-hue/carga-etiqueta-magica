DROP POLICY IF EXISTS "Admins can delete baixas" ON public.baixas_entrega;
CREATE POLICY "Operators and admins can delete baixas"
ON public.baixas_entrega FOR DELETE
USING (is_admin() OR is_active_operator());