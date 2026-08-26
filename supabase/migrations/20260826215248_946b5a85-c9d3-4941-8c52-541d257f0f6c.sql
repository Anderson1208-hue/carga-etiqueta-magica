UPDATE public.notas_fiscais nf
SET status_entrega = 'PENDENCIA DE BAIXA'
WHERE nf.status_entrega = 'NF EM ROTA'
  AND EXISTS (
    SELECT 1 FROM public.veiculo_nfs vn
    JOIN public.veiculos v ON v.id = vn.veiculo_id
    WHERE vn.nf_id = nf.id
      AND v.prestacao_contas_em IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.baixas_entrega b WHERE b.nf_id = nf.id
  );