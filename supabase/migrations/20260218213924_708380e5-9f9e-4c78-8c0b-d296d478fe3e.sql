
-- Block anonymous access to notas_fiscais
CREATE POLICY "Deny anonymous access to notas_fiscais"
ON public.notas_fiscais
FOR SELECT
TO anon
USING (false);
