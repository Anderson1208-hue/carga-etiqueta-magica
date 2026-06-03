
DROP POLICY IF EXISTS "Users can delete veiculo_nfs" ON public.veiculo_nfs;
DROP POLICY IF EXISTS "Admins can update veiculo_nfs" ON public.veiculo_nfs;

CREATE POLICY "Operators and admins can delete veiculo_nfs"
  ON public.veiculo_nfs FOR DELETE
  USING (is_admin() OR is_active_operator());

CREATE POLICY "Operators and admins can update veiculo_nfs"
  ON public.veiculo_nfs FOR UPDATE
  USING (is_admin() OR is_active_operator());

DROP POLICY IF EXISTS "Admins can delete veiculos" ON public.veiculos;

CREATE POLICY "Operators and admins can delete veiculos"
  ON public.veiculos FOR DELETE
  USING (is_admin() OR is_active_operator());
