REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.divergencias_recebimento FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.divergencias_recebimento_envios FROM authenticated;
REVOKE ALL ON public.divergencias_recebimento FROM anon;
REVOKE ALL ON public.divergencias_recebimento_envios FROM anon;