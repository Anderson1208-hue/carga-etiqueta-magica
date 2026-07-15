
CREATE TABLE public.destinatario_apelidos_busca (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj_raiz text NOT NULL UNIQUE,
  nome_busca text NOT NULL,
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cnpj_raiz_8_digitos CHECK (cnpj_raiz ~ '^[0-9]{8}$')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.destinatario_apelidos_busca TO authenticated;
GRANT ALL ON public.destinatario_apelidos_busca TO service_role;

ALTER TABLE public.destinatario_apelidos_busca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "apelidos_select" ON public.destinatario_apelidos_busca
  FOR SELECT TO authenticated
  USING (public.is_admin() OR public.is_active_operator());

CREATE POLICY "apelidos_insert" ON public.destinatario_apelidos_busca
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() OR public.is_active_operator());

CREATE POLICY "apelidos_update" ON public.destinatario_apelidos_busca
  FOR UPDATE TO authenticated
  USING (public.is_admin() OR public.is_active_operator())
  WITH CHECK (public.is_admin() OR public.is_active_operator());

CREATE POLICY "apelidos_delete" ON public.destinatario_apelidos_busca
  FOR DELETE TO authenticated
  USING (public.is_admin() OR public.is_active_operator());

CREATE TRIGGER trg_apelidos_updated_at
  BEFORE UPDATE ON public.destinatario_apelidos_busca
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
