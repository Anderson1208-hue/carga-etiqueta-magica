
ALTER TABLE public.baixas_entrega
  ADD COLUMN IF NOT EXISTS imagem_ibac_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS imagem_ibac_tentativas int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS imagem_ibac_ultimo_erro text,
  ADD COLUMN IF NOT EXISTS imagem_ibac_queue_id uuid;

CREATE INDEX IF NOT EXISTS idx_baixas_pendente_envio_imagem
  ON public.baixas_entrega (registrado_em)
  WHERE foto_path IS NOT NULL AND imagem_ibac_enviada_em IS NULL;

INSERT INTO public.ibac_de_para_eventos (evento_interno, descricao_interna, codigo_ibac, ativo)
VALUES ('envio_canhoto', 'Envio assíncrono da imagem do canhoto', NULL, true)
ON CONFLICT (evento_interno) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cnpj_envio_canhoto_auto (
  cnpj text PRIMARY KEY,
  descricao text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cnpj_envio_canhoto_auto TO authenticated;
GRANT ALL ON public.cnpj_envio_canhoto_auto TO service_role;

ALTER TABLE public.cnpj_envio_canhoto_auto ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operadores e admins leem CNPJs envio canhoto"
  ON public.cnpj_envio_canhoto_auto FOR SELECT
  TO authenticated
  USING (public.is_admin() OR public.is_active_operator());

CREATE POLICY "Admins gerenciam CNPJs envio canhoto"
  ON public.cnpj_envio_canhoto_auto FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE TRIGGER trg_cnpj_envio_canhoto_updated
  BEFORE UPDATE ON public.cnpj_envio_canhoto_auto
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.cnpj_envio_canhoto_auto (cnpj, descricao, ativo)
VALUES ('51825331', 'Cacau Show (raiz)', true)
ON CONFLICT (cnpj) DO NOTHING;
