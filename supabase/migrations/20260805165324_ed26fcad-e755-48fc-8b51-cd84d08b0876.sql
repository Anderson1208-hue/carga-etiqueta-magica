-- 1) Move as NFs do registro errado (06/08 criado por duplo pernoite) para o registro de 05/08
UPDATE public.veiculo_nfs
SET veiculo_id = 'fcba5e26-b757-4ccf-8756-2fcd7138c8ea'
WHERE veiculo_id = '4707278a-ee31-41ee-88b8-e76ccf8d9d48';

-- 2) Reabre o veículo de 05/08 (prestação de contas foi feita apenas pelo pernoite acidental)
UPDATE public.veiculos
SET prestacao_contas_em = NULL,
    prestacao_contas_por = NULL,
    prestacao_contas_obs = NULL,
    updated_at = now()
WHERE id = 'fcba5e26-b757-4ccf-8756-2fcd7138c8ea';

-- 3) Remove o registro duplicado de 06/08 gerado pelo pernoite indevido
DELETE FROM public.veiculos
WHERE id = '4707278a-ee31-41ee-88b8-e76ccf8d9d48';