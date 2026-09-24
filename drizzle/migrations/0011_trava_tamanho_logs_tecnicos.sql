CREATE OR REPLACE FUNCTION public.fn_limitar_tamanho_log()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE lim int := 4096; t text;
BEGIN
  IF NEW.request_body IS NOT NULL THEN
    t := NEW.request_body::text;
    IF octet_length(t) > lim THEN
      NEW.request_body := jsonb_build_object('truncado', true, 'tamanho_original', octet_length(t), 'inicio', left(t, 1000));
    END IF;
  END IF;
  IF NEW.response_body IS NOT NULL THEN
    t := NEW.response_body::text;
    IF octet_length(t) > lim THEN
      NEW.response_body := jsonb_build_object('truncado', true, 'tamanho_original', octet_length(t), 'inicio', left(t, 1000));
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tg_limitar_tamanho_log ON public.ibac_log_envios;
CREATE TRIGGER tg_limitar_tamanho_log BEFORE INSERT OR UPDATE ON public.ibac_log_envios
FOR EACH ROW EXECUTE FUNCTION public.fn_limitar_tamanho_log();

DROP TRIGGER IF EXISTS tg_limitar_tamanho_log ON public.okentrega_log_envios;
CREATE TRIGGER tg_limitar_tamanho_log BEFORE INSERT OR UPDATE ON public.okentrega_log_envios
FOR EACH ROW EXECUTE FUNCTION public.fn_limitar_tamanho_log();