-- Add weight columns to notas_fiscais table (total NF weight)
ALTER TABLE public.notas_fiscais
ADD COLUMN peso_bruto numeric DEFAULT 0,
ADD COLUMN peso_liquido numeric DEFAULT 0;