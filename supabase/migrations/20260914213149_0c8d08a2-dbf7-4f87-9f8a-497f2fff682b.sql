CREATE TABLE public.envios_canhoto_manuais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  criado_por uuid REFERENCES auth.users(id),
  criado_por_email text,
  destinatarios text[] NOT NULL,
  observacao text,
  filtro jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processando',
  erro text,
  itens jsonb,
  progresso_offset integer NOT NULL DEFAULT 0,
  total_notas integer NOT NULL DEFAULT 0,
  total_com_canhoto integer NOT NULL DEFAULT 0,
  total_sem_canhoto integer NOT NULL DEFAULT 0,
  partes jsonb NOT NULL DEFAULT '[]'::jsonb,
  xlsx_path text,
  enviado_em timestamptz,
  emails_enviados integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.envios_canhoto_manuais TO authenticated;
GRANT ALL ON public.envios_canhoto_manuais TO service_role;

ALTER TABLE public.envios_canhoto_manuais ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Operadores ativos veem envios de canhoto"
  ON public.envios_canhoto_manuais FOR SELECT
  TO authenticated
  USING (public.is_active_operator());

CREATE TRIGGER trg_envios_canhoto_manuais_updated_at
  BEFORE UPDATE ON public.envios_canhoto_manuais
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_envios_canhoto_manuais_created_at
  ON public.envios_canhoto_manuais (created_at DESC);