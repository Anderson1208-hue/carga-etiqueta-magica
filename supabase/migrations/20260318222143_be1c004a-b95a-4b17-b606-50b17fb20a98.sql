
-- Fix overly permissive policies
DROP POLICY "Anyone can insert positions" ON public.posicoes_gps;
CREATE POLICY "Authenticated can insert positions" ON public.posicoes_gps FOR INSERT TO authenticated WITH CHECK (has_profile());

DROP POLICY "Users can create alerts" ON public.alertas_monitoramento;
CREATE POLICY "Authenticated can create alerts" ON public.alertas_monitoramento FOR INSERT TO authenticated WITH CHECK (has_profile());
