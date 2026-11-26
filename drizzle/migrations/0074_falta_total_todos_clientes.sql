CREATE OR REPLACE FUNCTION public.nf_falta_total_cliente(_nf uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT EXISTS (SELECT 1 FROM itens_nf WHERE nf_id=_nf) AND NOT EXISTS (
    SELECT 1 FROM (SELECT c_prod, sum(q_com) q FROM itens_nf WHERE nf_id=_nf GROUP BY c_prod) i
    WHERE coalesce((SELECT sum(d.quantidade) FROM divergencias_recebimento_clientes d
      WHERE d.nf_id=_nf AND d.c_prod=i.c_prod AND d.status='FALTA' AND d.cancelado_em IS NULL),0) < i.q)
$$;

CREATE OR REPLACE FUNCTION public.fn_falta_total_cliente_agenda_cd()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.nf_id IS NOT NULL AND NEW.status='FALTA' AND NEW.cancelado_em IS NULL AND public.nf_falta_total_cliente(NEW.nf_id)
     AND coalesce((SELECT a.status FROM agendamentos a WHERE a.nf_id=NEW.nf_id ORDER BY a.created_at DESC LIMIT 1),'') <> 'FALTA DIRETA DO CD' THEN
    INSERT INTO agendamentos(nf_id,status,observacao,created_by)
    VALUES (NEW.nf_id,'FALTA DIRETA DO CD','Automático: falta total na divergência de recebimento',NEW.criado_por);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_falta_total_cliente_agenda_cd ON public.divergencias_recebimento_clientes;
CREATE TRIGGER trg_falta_total_cliente_agenda_cd AFTER INSERT OR UPDATE ON public.divergencias_recebimento_clientes
FOR EACH ROW EXECUTE FUNCTION public.fn_falta_total_cliente_agenda_cd();

CREATE OR REPLACE FUNCTION public.fn_bloqueia_agenda_falta_total()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.status <> 'FALTA DIRETA DO CD' AND (EXISTS (
    SELECT 1 FROM divergencias_recebimento d WHERE d.nf_id=NEW.nf_id AND d.tipo='falta_total' AND d.cancelado_em IS NULL)
    OR (EXISTS (SELECT 1 FROM divergencias_recebimento_clientes c WHERE c.nf_id=NEW.nf_id AND c.status='FALTA' AND c.cancelado_em IS NULL)
        AND public.nf_falta_total_cliente(NEW.nf_id))) THEN
    RAISE EXCEPTION 'NF com falta total na divergência: não pode ser agendada (Falta Direta do CD)';
  END IF;
  RETURN NEW;
END $$;

INSERT INTO public.agendamentos(nf_id,status,observacao,created_by)
SELECT DISTINCT ON (d.nf_id) d.nf_id,'FALTA DIRETA DO CD','Automático: falta total na divergência de recebimento',d.criado_por
FROM public.divergencias_recebimento_clientes d
WHERE d.status='FALTA' AND d.cancelado_em IS NULL AND d.nf_id IS NOT NULL AND public.nf_falta_total_cliente(d.nf_id)
  AND coalesce((SELECT a.status FROM public.agendamentos a WHERE a.nf_id=d.nf_id ORDER BY a.created_at DESC LIMIT 1),'') <> 'FALTA DIRETA DO CD'
ORDER BY d.nf_id, d.criado_em DESC;