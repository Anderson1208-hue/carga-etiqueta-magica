-- Limpar veículos pernoite duplicados de LBV6917 criados nas tentativas falhas
-- Mantém apenas 644c2cd3 (primeiro criado) e remove os outros 2.
-- Também move os vínculos veiculo_nfs do veículo original (28/05) para o pernoite (29/05).
DELETE FROM public.veiculos WHERE id IN (
  '7e14d947-57b0-4163-9b32-e2ab346fa723',
  'a6e0c874-b48f-4822-b43d-63beb97e5085'
);

UPDATE public.veiculo_nfs
   SET veiculo_id = '644c2cd3-a5fd-485b-94f9-f30f8fa0bbe6'
 WHERE veiculo_id = 'bf9b9974-3a5c-4140-911a-f24857ed2b61';

-- Encerrar prestação do veículo original (28/05) com marca [PERNOITE]
UPDATE public.veiculos
   SET prestacao_contas_em = COALESCE(prestacao_contas_em, now()),
       prestacao_contas_obs = COALESCE(prestacao_contas_obs, '[PERNOITE] Veículo pernoitou (continua em 29/05/2026).')
 WHERE id = 'bf9b9974-3a5c-4140-911a-f24857ed2b61';