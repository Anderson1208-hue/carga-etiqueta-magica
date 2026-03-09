
-- Tabela para armazenar CNPJs que geram agendamento automático
CREATE TABLE public.cnpj_agenda_automatica (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.cnpj_agenda_automatica ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage cnpj_agenda" ON public.cnpj_agenda_automatica FOR ALL TO authenticated USING (is_admin());
CREATE POLICY "Operators can view cnpj_agenda" ON public.cnpj_agenda_automatica FOR SELECT TO authenticated USING (is_active_operator());

-- Inserir os CNPJs
INSERT INTO public.cnpj_agenda_automatica (cnpj) VALUES
  ('17611014022202'),
  ('17611014015095'),
  ('17611014019325'),
  ('17611014033824'),
  ('17611014039350'),
  ('17611014039431'),
  ('17611014024671'),
  ('17611014024590'),
  ('17611014046217'),
  ('17611014021737'),
  ('17611014047884'),
  ('17611014040600'),
  ('35522134000157');

-- Trigger para criar agendamento automático
CREATE OR REPLACE FUNCTION public.auto_agenda_por_cnpj()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM cnpj_agenda_automatica WHERE cnpj = NEW.cnpj_destinatario) THEN
    INSERT INTO agendamentos (nf_id, status)
    VALUES (NEW.id, 'AGUARDANDO AGENDA');
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_auto_agenda_cnpj
  AFTER INSERT ON public.notas_fiscais
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_agenda_por_cnpj();
