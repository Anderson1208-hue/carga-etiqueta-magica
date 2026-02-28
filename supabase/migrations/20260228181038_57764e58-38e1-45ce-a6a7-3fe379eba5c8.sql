
-- Add status_entrega to notas_fiscais for NF lifecycle tracking
ALTER TABLE public.notas_fiscais 
ADD COLUMN status_entrega text NOT NULL DEFAULT 'CARGA NO DEPOSITO';

-- Validation trigger for status_entrega
CREATE OR REPLACE FUNCTION public.validate_status_entrega()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status_entrega NOT IN ('CARGA NO DEPOSITO', 'NF EM ROTA', 'ENTREGUE', 'RECUSADO') THEN
    RAISE EXCEPTION 'status_entrega inválido: %', NEW.status_entrega;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_status_entrega_trigger
BEFORE INSERT OR UPDATE ON public.notas_fiscais
FOR EACH ROW EXECUTE FUNCTION public.validate_status_entrega();

-- Create agendamentos table
CREATE TABLE public.agendamentos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nf_id uuid NOT NULL REFERENCES public.notas_fiscais(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'AGUARDANDO AGENDA',
  data_agendamento date NULL,
  observacao text NULL,
  created_by uuid NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Validation trigger for agendamento status
CREATE OR REPLACE FUNCTION public.validate_agendamento_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.status NOT IN ('AGENDAMENTO', 'AGUARDANDO AGENDA', 'REENTREGA', 'DEVOLUCAO') THEN
    RAISE EXCEPTION 'status de agendamento inválido: %', NEW.status;
  END IF;
  -- Require date for AGENDAMENTO and REENTREGA
  IF NEW.status IN ('AGENDAMENTO', 'REENTREGA') AND NEW.data_agendamento IS NULL THEN
    RAISE EXCEPTION 'data_agendamento é obrigatória para status %', NEW.status;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_agendamento_status_trigger
BEFORE INSERT OR UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.validate_agendamento_status();

-- Updated_at trigger
CREATE TRIGGER update_agendamentos_updated_at
BEFORE UPDATE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.agendamentos ENABLE ROW LEVEL SECURITY;

-- RLS policies for agendamentos
CREATE POLICY "Users can view agendamentos of accessible NFs"
ON public.agendamentos FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM notas_fiscais nf
    JOIN cargas c ON c.id = nf.carga_id
    WHERE nf.id = agendamentos.nf_id
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid()
      OR EXISTS (SELECT 1 FROM carga_operadores co WHERE co.carga_id = c.id AND co.operador_id = auth.uid()))
  )
);

CREATE POLICY "Authenticated users can create agendamentos"
ON public.agendamentos FOR INSERT
WITH CHECK (has_profile());

CREATE POLICY "Users can update agendamentos of accessible NFs"
ON public.agendamentos FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM notas_fiscais nf
    JOIN cargas c ON c.id = nf.carga_id
    WHERE nf.id = agendamentos.nf_id
    AND (is_admin() OR c.created_by = auth.uid() OR c.operador_responsavel = auth.uid()
      OR EXISTS (SELECT 1 FROM carga_operadores co WHERE co.carga_id = c.id AND co.operador_id = auth.uid()))
  )
);

CREATE POLICY "Admins can delete agendamentos"
ON public.agendamentos FOR DELETE
USING (is_admin());

-- Index for performance
CREATE INDEX idx_agendamentos_nf_id ON public.agendamentos(nf_id);
CREATE INDEX idx_notas_fiscais_status_entrega ON public.notas_fiscais(status_entrega);
