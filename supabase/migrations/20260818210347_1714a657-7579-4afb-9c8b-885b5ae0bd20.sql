ALTER TABLE public.okentrega_config
  ADD COLUMN IF NOT EXISTS cnpjs_emitente text[] NOT NULL DEFAULT '{}';