CREATE TABLE public.macro_regioes (
  numero integer PRIMARY KEY CHECK (numero > 0 AND numero <> 99),
  nome text NOT NULL,
  ativa boolean NOT NULL DEFAULT true,
  atualizado_por uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.macro_regiao_termos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  termo text NOT NULL,
  termo_norm text NOT NULL UNIQUE,
  tipo text NOT NULL CHECK (tipo IN ('bairro','cidade')),
  macro_numero integer NOT NULL REFERENCES public.macro_regioes(numero) ON DELETE CASCADE,
  atualizado_por uuid,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.macro_regioes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.macro_regiao_termos TO authenticated;
GRANT ALL ON public.macro_regioes TO service_role;
GRANT ALL ON public.macro_regiao_termos TO service_role;
ALTER TABLE public.macro_regioes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.macro_regiao_termos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "mr ver" ON public.macro_regioes FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR public.is_active_operator());
CREATE POLICY "mr editar" ON public.macro_regioes FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.is_active_operator()) WITH CHECK (public.is_admin(auth.uid()) OR public.is_active_operator());
CREATE POLICY "mrt ver" ON public.macro_regiao_termos FOR SELECT TO authenticated USING (public.is_admin(auth.uid()) OR public.is_active_operator());
CREATE POLICY "mrt editar" ON public.macro_regiao_termos FOR ALL TO authenticated USING (public.is_admin(auth.uid()) OR public.is_active_operator()) WITH CHECK (public.is_admin(auth.uid()) OR public.is_active_operator());
CREATE OR REPLACE FUNCTION public.fn_mr_autor() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN NEW.atualizado_por := auth.uid(); NEW.atualizado_em := now(); RETURN NEW; END $$;
CREATE TRIGGER trg_mr_autor BEFORE INSERT OR UPDATE ON public.macro_regioes FOR EACH ROW EXECUTE FUNCTION public.fn_mr_autor();
CREATE TRIGGER trg_mrt_autor BEFORE INSERT OR UPDATE ON public.macro_regiao_termos FOR EACH ROW EXECUTE FUNCTION public.fn_mr_autor();