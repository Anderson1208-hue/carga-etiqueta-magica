
CREATE TABLE public.ctes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carga_id uuid NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  nf_id uuid REFERENCES public.notas_fiscais(id) ON DELETE SET NULL,
  chave_cte text NOT NULL UNIQUE,
  numero_cte text NOT NULL,
  chave_nf_referenciada text,
  cnpj_emitente text,
  razao_social_emitente text,
  valor_frete numeric DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ctes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view ctes" ON public.ctes
  FOR SELECT TO authenticated
  USING (is_admin() OR is_active_operator());

CREATE POLICY "Authenticated users can create ctes" ON public.ctes
  FOR INSERT TO authenticated
  WITH CHECK (has_profile());

CREATE POLICY "Admins can delete ctes" ON public.ctes
  FOR DELETE TO authenticated
  USING (is_admin());
