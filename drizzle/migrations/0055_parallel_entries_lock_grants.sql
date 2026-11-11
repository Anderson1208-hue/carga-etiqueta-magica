REVOKE ALL ON public.paralelo_entradas FROM anon, authenticated;
GRANT SELECT ON public.paralelo_entradas TO authenticated;
GRANT ALL ON public.paralelo_entradas TO service_role;
-- RLS já limita SELECT a (SELECT public.pode_comercial_paralelo()); nenhuma escrita é permitida pelo Data API.