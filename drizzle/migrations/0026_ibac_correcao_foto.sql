ALTER TABLE public.ibac_portal_validacao
  ADD COLUMN IF NOT EXISTS nova_foto_path text,
  ADD COLUMN IF NOT EXISTS nova_foto_anexada_em timestamptz,
  ADD COLUMN IF NOT EXISTS nova_foto_enviada_em timestamptz,
  ADD COLUMN IF NOT EXISTS nova_foto_queue_id uuid,
  ADD COLUMN IF NOT EXISTS nova_foto_resultado text;