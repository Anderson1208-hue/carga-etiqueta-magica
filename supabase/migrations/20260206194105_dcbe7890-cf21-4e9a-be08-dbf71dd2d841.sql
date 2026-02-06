
-- Block anonymous access to itens_nf table
CREATE POLICY "Deny anonymous access to itens_nf"
ON public.itens_nf
FOR SELECT
TO anon
USING (false);

-- Block anonymous access to profiles table  
CREATE POLICY "Deny anonymous access to profiles"
ON public.profiles
FOR SELECT
TO anon
USING (false);
