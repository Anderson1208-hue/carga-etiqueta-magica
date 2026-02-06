-- Drop existing foreign keys and recreate with ON DELETE CASCADE
-- This ensures complete cascade deletion when a carga is deleted

-- 1. notas_fiscais -> cargas
ALTER TABLE public.notas_fiscais 
DROP CONSTRAINT IF EXISTS notas_fiscais_carga_id_fkey;

ALTER TABLE public.notas_fiscais
ADD CONSTRAINT notas_fiscais_carga_id_fkey 
FOREIGN KEY (carga_id) REFERENCES public.cargas(id) ON DELETE CASCADE;

-- 2. itens_nf -> notas_fiscais
ALTER TABLE public.itens_nf 
DROP CONSTRAINT IF EXISTS itens_nf_nf_id_fkey;

ALTER TABLE public.itens_nf
ADD CONSTRAINT itens_nf_nf_id_fkey 
FOREIGN KEY (nf_id) REFERENCES public.notas_fiscais(id) ON DELETE CASCADE;

-- 3. etiquetas -> cargas
ALTER TABLE public.etiquetas 
DROP CONSTRAINT IF EXISTS etiquetas_carga_id_fkey;

ALTER TABLE public.etiquetas
ADD CONSTRAINT etiquetas_carga_id_fkey 
FOREIGN KEY (carga_id) REFERENCES public.cargas(id) ON DELETE CASCADE;

-- 4. etiquetas -> notas_fiscais
ALTER TABLE public.etiquetas 
DROP CONSTRAINT IF EXISTS etiquetas_nf_id_fkey;

ALTER TABLE public.etiquetas
ADD CONSTRAINT etiquetas_nf_id_fkey 
FOREIGN KEY (nf_id) REFERENCES public.notas_fiscais(id) ON DELETE CASCADE;