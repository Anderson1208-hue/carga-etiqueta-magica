
CREATE TABLE public.ibac_config_retry (
  id boolean PRIMARY KEY DEFAULT true CHECK (id = true),
  max_tentativas integer NOT NULL DEFAULT 5 CHECK (max_tentativas >= 1 AND max_tentativas <= 20),
  backoff_base_segundos integer NOT NULL DEFAULT 60 CHECK (backoff_base_segundos >= 10),
  backoff_max_segundos integer NOT NULL DEFAULT 3600 CHECK (backoff_max_segundos >= 60),
  ativo boolean NOT NULL DEFAULT true,
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ibac_config_retry TO authenticated;
GRANT ALL ON public.ibac_config_retry TO service_role;

ALTER TABLE public.ibac_config_retry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin ler config retry ibac"
  ON public.ibac_config_retry FOR SELECT TO authenticated
  USING (is_admin());

CREATE POLICY "Admin inserir config retry ibac"
  ON public.ibac_config_retry FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "Admin atualizar config retry ibac"
  ON public.ibac_config_retry FOR UPDATE TO authenticated
  USING (is_admin());

INSERT INTO public.ibac_config_retry (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
