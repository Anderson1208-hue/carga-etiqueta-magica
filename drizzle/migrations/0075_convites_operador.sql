CREATE TABLE public.convites_operador (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash text NOT NULL UNIQUE,
  criado_por uuid NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  expira_em timestamptz NOT NULL DEFAULT now() + interval '96 hours',
  usado_em timestamptz,
  usado_por uuid
);
GRANT SELECT ON public.convites_operador TO authenticated;
GRANT ALL ON public.convites_operador TO service_role;
ALTER TABLE public.convites_operador ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins veem convites" ON public.convites_operador FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

CREATE OR REPLACE FUNCTION public.criar_convite_operador()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_token text;
BEGIN
  IF NOT (SELECT public.is_admin()) THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');
  INSERT INTO public.convites_operador (token_hash, criado_por)
  VALUES (encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid());
  RETURN v_token;
END $$;
REVOKE EXECUTE ON FUNCTION public.criar_convite_operador() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.criar_convite_operador() TO authenticated;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_conv uuid; v_tok text := NEW.raw_user_meta_data->>'convite';
BEGIN
  IF v_tok IS NOT NULL AND length(v_tok) BETWEEN 20 AND 100 THEN
    UPDATE public.convites_operador SET usado_em = now(), usado_por = NEW.id
    WHERE token_hash = encode(extensions.digest(v_tok, 'sha256'), 'hex')
      AND usado_em IS NULL AND expira_em > now()
    RETURNING id INTO v_conv;
  END IF;
  INSERT INTO public.profiles (id, email, full_name, role, ativo)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), 'operador', v_conv IS NOT NULL);
  RETURN NEW;
END $$;