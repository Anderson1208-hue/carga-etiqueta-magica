CREATE OR REPLACE FUNCTION public.fn_falta_total_agenda_cd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.tipo='falta_total' AND NEW.cancelado_em IS NULL AND NEW.nf_id IS NOT NULL
     AND coalesce((SELECT a.status FROM agendamentos a WHERE a.nf_id=NEW.nf_id ORDER BY a.created_at DESC LIMIT 1),'') <> 'FALTA DIRETA DO CD' THEN
    INSERT INTO agendamentos(nf_id,status,observacao,created_by)
    VALUES (NEW.nf_id,'FALTA DIRETA DO CD','Automático: falta total na divergência de recebimento',NEW.criado_por);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_falta_total_agenda_cd ON public.divergencias_recebimento;
CREATE TRIGGER trg_falta_total_agenda_cd AFTER INSERT ON public.divergencias_recebimento
FOR EACH ROW EXECUTE FUNCTION public.fn_falta_total_agenda_cd();

CREATE OR REPLACE FUNCTION public.fn_bloqueia_agenda_falta_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status <> 'FALTA DIRETA DO CD' AND EXISTS (
    SELECT 1 FROM divergencias_recebimento d WHERE d.nf_id=NEW.nf_id AND d.tipo='falta_total' AND d.cancelado_em IS NULL) THEN
    RAISE EXCEPTION 'NF com falta total na divergência: não pode ser agendada (Falta Direta do CD)';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_bloqueia_agenda_falta_total ON public.agendamentos;
CREATE TRIGGER trg_bloqueia_agenda_falta_total BEFORE INSERT OR UPDATE OF status ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_bloqueia_agenda_falta_total();

INSERT INTO public.agendamentos(nf_id,status,observacao,created_by)
SELECT DISTINCT ON (d.nf_id) d.nf_id,'FALTA DIRETA DO CD','Automático: falta total na divergência de recebimento',d.criado_por
FROM public.divergencias_recebimento d
WHERE d.tipo='falta_total' AND d.cancelado_em IS NULL AND d.nf_id IS NOT NULL
  AND coalesce((SELECT a.status FROM public.agendamentos a WHERE a.nf_id=d.nf_id ORDER BY a.created_at DESC LIMIT 1),'') <> 'FALTA DIRETA DO CD'
ORDER BY d.nf_id, d.criado_em DESC;