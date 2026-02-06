-- Add weight columns to itens_nf table
ALTER TABLE public.itens_nf
ADD COLUMN peso_bruto numeric DEFAULT 0,
ADD COLUMN peso_liquido numeric DEFAULT 0;