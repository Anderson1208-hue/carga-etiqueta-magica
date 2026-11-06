ALTER TABLE public.notas_fiscais ADD COLUMN IF NOT EXISTS termo_sensivel boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.nf_raiz_chocolate_total(_cnpj text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT left(regexp_replace(coalesce(_cnpj,''),'\D','','g'),8) IN ('04429377','61472205','42431457','29737368','02322266')
$$;

CREATE OR REPLACE FUNCTION public.nf_calcular_termo_sensivel(_nf_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT CASE
    WHEN public.nf_raiz_chocolate_total(n.cnpj_emitente) THEN true
    WHEN left(regexp_replace(coalesce(n.cnpj_emitente,''),'\D','','g'),8) = '94261534' THEN false
    ELSE EXISTS (
      SELECT 1 FROM public.itens_nf i
      JOIN public.produtos p
        ON lower(btrim(p.codigo)) = lower(btrim(i.c_prod))
       AND left(p.cnpj_embarcador,8) = left(regexp_replace(coalesce(n.cnpj_emitente,''),'\D','','g'),8)
      WHERE i.nf_id = n.id
        AND (p.termo_sensivel OR p.segmento ILIKE '10-Chocolate%')
    )
  END
  FROM public.notas_fiscais n WHERE n.id = _nf_id
$$;

CREATE OR REPLACE FUNCTION public.fn_nf_termo_sensivel_insert()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF public.nf_raiz_chocolate_total(NEW.cnpj_emitente) THEN NEW.termo_sensivel := true; END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_nf_termo_sensivel_insert BEFORE INSERT ON public.notas_fiscais
FOR EACH ROW EXECUTE FUNCTION public.fn_nf_termo_sensivel_insert();

CREATE OR REPLACE FUNCTION public.fn_itens_nf_termo_sensivel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.notas_fiscais n
     SET termo_sensivel = true
   WHERE n.id IN (SELECT DISTINCT nf_id FROM novos)
     AND n.termo_sensivel = false
     AND public.nf_calcular_termo_sensivel(n.id);
  RETURN NULL;
END $$;

CREATE TRIGGER trg_itens_nf_termo_sensivel AFTER INSERT ON public.itens_nf
REFERENCING NEW TABLE AS novos FOR EACH STATEMENT EXECUTE FUNCTION public.fn_itens_nf_termo_sensivel();

CREATE OR REPLACE FUNCTION public.fn_nf_carga_chocolate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.termo_sensivel AND NEW.carga_id IS NOT NULL THEN
    UPDATE public.cargas SET tipo_carga = 'CHOCOLATE'
     WHERE id = NEW.carga_id AND tipo_carga IS DISTINCT FROM 'CHOCOLATE';
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER trg_nf_carga_chocolate AFTER INSERT OR UPDATE OF termo_sensivel, carga_id ON public.notas_fiscais
FOR EACH ROW EXECUTE FUNCTION public.fn_nf_carga_chocolate();