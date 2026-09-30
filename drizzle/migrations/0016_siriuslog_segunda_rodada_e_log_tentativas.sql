-- Histórico de cada tentativa de envio ao portal Sirius Log (motivo de cada recusa, nota a nota)
CREATE TABLE IF NOT EXISTS public.log_tentativas_tracking_pandurata (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  numero_nf text NOT NULL,
  criado_em timestamptz NOT NULL DEFAULT now(),
  origem text NOT NULL DEFAULT 'manual',
  modo text NOT NULL DEFAULT 'gravacao',
  passo int,
  situacao text,
  status_alvo text,
  status_portal text,
  http int,
  erro text
);
GRANT ALL ON public.log_tentativas_tracking_pandurata TO service_role;
ALTER TABLE public.log_tentativas_tracking_pandurata ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_log_tentativas_sirius_nf ON public.log_tentativas_tracking_pandurata (numero_nf, criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_log_tentativas_sirius_data ON public.log_tentativas_tracking_pandurata (criado_em DESC);

-- Segunda rodada diária: 15:00 horário de Brasília (18:00 UTC), seg a sex.
-- Só roda em dia útil: a própria função siriuslog-rotina faz a guarda.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'tracking-pandurata-tarde') THEN
    PERFORM cron.unschedule('tracking-pandurata-tarde');
  END IF;
END $$;

SELECT cron.schedule(
  'tracking-pandurata-tarde',
  '0 18 * * 1-5',
  $cron$
  SELECT net.http_post(
    url := 'https://ddcglijsqqiaulmfadxh.supabase.co/functions/v1/siriuslog-rotina',
    headers := '{"Content-Type": "application/json", "apikey": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRkY2dsaWpzcXFpYXVsbWZhZHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk4MDg3NDYsImV4cCI6MjA4NTM4NDc0Nn0.nuEFYPTWTaUjjt8Q3sVyfYb7o6n_2HBCxMDWtJ_fQ8M"}'::jsonb,
    body := '{"origem": "tarde"}'::jsonb
  ) AS request_id;
  $cron$
);