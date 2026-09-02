CREATE TABLE public.relatorios_canhotos_diarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_referencia date NOT NULL UNIQUE,
  total_entregas integer NOT NULL DEFAULT 0,
  total_com_canhoto integer NOT NULL DEFAULT 0,
  total_sem_canhoto integer NOT NULL DEFAULT 0,
  pdf_path text,
  zip_path text,
  xlsx_path text,
  pdf_bytes bigint,
  zip_bytes bigint,
  xlsx_bytes bigint,
  status text NOT NULL DEFAULT 'pendente',
  erro text,
  gerado_em timestamptz,
  enviado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT relatorios_canhotos_status_chk CHECK (status IN ('pendente','processando','concluido','erro'))
);

GRANT SELECT ON public.relatorios_canhotos_diarios TO authenticated;
GRANT ALL ON public.relatorios_canhotos_diarios TO service_role;
ALTER TABLE public.relatorios_canhotos_diarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operadores ativos podem ver relatorios de canhotos"
ON public.relatorios_canhotos_diarios FOR SELECT TO authenticated
USING (public.is_active_operator());

CREATE TRIGGER trg_relatorios_canhotos_diarios_updated_at
BEFORE UPDATE ON public.relatorios_canhotos_diarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_relatorios_canhotos_data ON public.relatorios_canhotos_diarios (data_referencia DESC);

CREATE TABLE public.relatorios_canhotos_destinatarios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  nome text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.relatorios_canhotos_destinatarios TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.relatorios_canhotos_destinatarios TO authenticated;
GRANT ALL ON public.relatorios_canhotos_destinatarios TO service_role;
ALTER TABLE public.relatorios_canhotos_destinatarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operadores ativos podem ver destinatarios de relatorio"
ON public.relatorios_canhotos_destinatarios FOR SELECT TO authenticated
USING (public.is_active_operator());

CREATE POLICY "Admins gerenciam destinatarios de relatorio"
ON public.relatorios_canhotos_destinatarios FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_relatorios_canhotos_destinatarios_updated_at
BEFORE UPDATE ON public.relatorios_canhotos_destinatarios
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.relatorios_canhotos_destinatarios (email, nome)
VALUES ('faturamento@tlmlogistica.com.br', 'Faturamento')
ON CONFLICT (email) DO NOTHING;

CREATE POLICY "Operadores ativos podem baixar relatorios de canhotos"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'relatorios-canhotos' AND public.is_active_operator());