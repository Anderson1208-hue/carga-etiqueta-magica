CREATE TABLE public.ibac_portal_validacao (
  chave text PRIMARY KEY,
  numero_nf text,
  status_portal text,
  status_validacao text,
  possui_imagem text,
  justificativa text,
  recebedor text,
  data_entrega timestamptz,
  data_criacao_portal timestamptz,
  consultado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.ibac_portal_validacao TO authenticated;
GRANT ALL ON public.ibac_portal_validacao TO service_role;
ALTER TABLE public.ibac_portal_validacao ENABLE ROW LEVEL SECURITY;
CREATE POLICY "operadores leem validacao ibac" ON public.ibac_portal_validacao
  FOR SELECT TO authenticated USING ((SELECT public.is_active_operator()));
CREATE INDEX ibac_portal_validacao_numero_idx ON public.ibac_portal_validacao (numero_nf);