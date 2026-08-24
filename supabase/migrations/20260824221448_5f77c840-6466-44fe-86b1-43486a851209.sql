ALTER TABLE public.baixas_entrega
  ADD COLUMN IF NOT EXISTS foto_recibo_path text;

COMMENT ON COLUMN public.baixas_entrega.foto_recibo_path IS
  'Tira do recibo (JPEG 1536x240 @150dpi) derivada de foto_path. Usada na conferência rápida e no envio de canhotos (IBAC/OK Entrega). A foto original permanece intacta em foto_path.';