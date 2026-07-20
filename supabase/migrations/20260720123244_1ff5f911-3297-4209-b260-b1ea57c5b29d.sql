REVOKE EXECUTE ON FUNCTION public.provisionar_torre_veiculo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.provisionar_torre_veiculo(uuid) TO authenticated;