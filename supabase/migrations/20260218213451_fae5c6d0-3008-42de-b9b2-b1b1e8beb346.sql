
-- 1. Add new value to label_status enum
ALTER TYPE public.label_status ADD VALUE IF NOT EXISTS 'conferido_interno' AFTER 'pendente';

-- 2. Add internal conference tracking columns to etiquetas
ALTER TABLE public.etiquetas
  ADD COLUMN IF NOT EXISTS conferido_interno_em timestamp with time zone,
  ADD COLUMN IF NOT EXISTS conferido_interno_por uuid;
