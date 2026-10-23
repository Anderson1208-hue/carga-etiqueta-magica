CREATE TABLE public.okentrega_cron_auth (id boolean PRIMARY KEY DEFAULT true, token uuid NOT NULL DEFAULT gen_random_uuid());
GRANT ALL ON public.okentrega_cron_auth TO service_role;
REVOKE ALL ON public.okentrega_cron_auth FROM anon, authenticated;
ALTER TABLE public.okentrega_cron_auth ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.okentrega_validar_cron(p_token text) RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT p_token IS NOT NULL AND EXISTS (SELECT 1 FROM public.okentrega_cron_auth WHERE id = true AND token::text = p_token) $$;
REVOKE ALL ON FUNCTION public.okentrega_validar_cron(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.okentrega_validar_cron(text) TO service_role;