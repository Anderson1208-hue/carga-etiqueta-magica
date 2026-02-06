-- Adicionar campos de endereço na tabela notas_fiscais
ALTER TABLE public.notas_fiscais 
ADD COLUMN IF NOT EXISTS dest_razao_social TEXT,
ADD COLUMN IF NOT EXISTS dest_logradouro TEXT,
ADD COLUMN IF NOT EXISTS dest_numero TEXT,
ADD COLUMN IF NOT EXISTS dest_bairro TEXT,
ADD COLUMN IF NOT EXISTS dest_cidade TEXT,
ADD COLUMN IF NOT EXISTS dest_uf TEXT,
ADD COLUMN IF NOT EXISTS dest_cep TEXT;

-- Criar tabela para roteirizações
CREATE TABLE IF NOT EXISTS public.roteirizacoes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  carga_id UUID NOT NULL REFERENCES public.cargas(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  ponto_inicial_lat NUMERIC,
  ponto_inicial_lng NUMERIC,
  ponto_inicial_nome TEXT DEFAULT 'Centro de Distribuição',
  distancia_total_km NUMERIC,
  tempo_estimado_min INTEGER,
  status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'calculando', 'concluida', 'erro'))
);

-- Criar tabela para paradas da roteirização
CREATE TABLE IF NOT EXISTS public.roteirizacao_paradas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  roteirizacao_id UUID NOT NULL REFERENCES public.roteirizacoes(id) ON DELETE CASCADE,
  cnpj_destinatario TEXT NOT NULL,
  razao_social TEXT,
  endereco_completo TEXT,
  latitude NUMERIC,
  longitude NUMERIC,
  ordem INTEGER NOT NULL,
  total_nfs INTEGER DEFAULT 0,
  total_caixas INTEGER DEFAULT 0,
  distancia_anterior_km NUMERIC,
  tempo_anterior_min INTEGER
);

-- Enable RLS
ALTER TABLE public.roteirizacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roteirizacao_paradas ENABLE ROW LEVEL SECURITY;

-- RLS policies for roteirizacoes
CREATE POLICY "Authenticated users can view roteirizacoes" 
ON public.roteirizacoes 
FOR SELECT 
USING (has_profile());

CREATE POLICY "Authenticated users can create roteirizacoes" 
ON public.roteirizacoes 
FOR INSERT 
WITH CHECK (has_profile());

CREATE POLICY "Authenticated users can update roteirizacoes" 
ON public.roteirizacoes 
FOR UPDATE 
USING (has_profile());

CREATE POLICY "Admins can delete roteirizacoes" 
ON public.roteirizacoes 
FOR DELETE 
USING (is_admin());

-- RLS policies for roteirizacao_paradas
CREATE POLICY "Authenticated users can view paradas" 
ON public.roteirizacao_paradas 
FOR SELECT 
USING (has_profile());

CREATE POLICY "Authenticated users can create paradas" 
ON public.roteirizacao_paradas 
FOR INSERT 
WITH CHECK (has_profile());

CREATE POLICY "Authenticated users can update paradas" 
ON public.roteirizacao_paradas 
FOR UPDATE 
USING (has_profile());

CREATE POLICY "Admins can delete paradas" 
ON public.roteirizacao_paradas 
FOR DELETE 
USING (is_admin());