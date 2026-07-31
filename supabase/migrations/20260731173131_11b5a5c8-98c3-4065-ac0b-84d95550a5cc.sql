CREATE TABLE IF NOT EXISTS public.ibac_config_envio (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  envio_ativo boolean NOT NULL DEFAULT false,
  modo_imagem text NOT NULL DEFAULT 'url' CHECK (modo_imagem IN ('url','base64')),
  whitelist_nfs text[] NOT NULL DEFAULT '{}',
  codigo_evento_entrega text NOT NULL DEFAULT '01',
  max_imagem_kb integer NOT NULL DEFAULT 1024,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.ibac_config_envio TO authenticated;
GRANT ALL ON public.ibac_config_envio TO service_role;

ALTER TABLE public.ibac_config_envio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins gerenciam config envio ibac" ON public.ibac_config_envio;
CREATE POLICY "admins gerenciam config envio ibac"
ON public.ibac_config_envio FOR ALL TO authenticated
USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP TRIGGER IF EXISTS trg_ibac_config_envio_updated ON public.ibac_config_envio;
CREATE TRIGGER trg_ibac_config_envio_updated
BEFORE UPDATE ON public.ibac_config_envio
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.ibac_config_envio (id) VALUES (true) ON CONFLICT (id) DO NOTHING;