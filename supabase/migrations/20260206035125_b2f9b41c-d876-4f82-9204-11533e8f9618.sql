-- Add weight and cubic volume columns to roteirizacao_paradas
ALTER TABLE public.roteirizacao_paradas
ADD COLUMN peso_total_kg numeric DEFAULT 0,
ADD COLUMN volume_total_m3 numeric DEFAULT 0;

-- Add totals to roteirizacoes header
ALTER TABLE public.roteirizacoes
ADD COLUMN peso_total_kg numeric DEFAULT 0,
ADD COLUMN volume_total_m3 numeric DEFAULT 0;