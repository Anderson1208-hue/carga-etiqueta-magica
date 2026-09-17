SET default_transaction_read_only TO 'off';

CREATE TABLE IF NOT EXISTS public.ibac_log_envios_novo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id uuid,
  endpoint text,
  request_body jsonb,
  response_status integer,
  response_body jsonb,
  duracao_ms integer,
  sucesso boolean,
  created_at timestamptz DEFAULT now()
);

GRANT SELECT, INSERT ON public.ibac_log_envios_novo TO authenticated;
GRANT ALL ON public.ibac_log_envios_novo TO service_role;

ALTER TABLE public.ibac_log_envios_novo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins insere log ibac" ON public.ibac_log_envios_novo FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "Admins visualizam log ibac" ON public.ibac_log_envios_novo FOR SELECT TO authenticated USING (is_admin());
CREATE POLICY "IBAC autorizados leem log" ON public.ibac_log_envios_novo FOR SELECT TO authenticated USING (pode_ver_ibac());