CREATE POLICY "Operadores visualizam config okentrega"
ON public.okentrega_config
FOR SELECT
TO authenticated
USING (public.is_active_operator());