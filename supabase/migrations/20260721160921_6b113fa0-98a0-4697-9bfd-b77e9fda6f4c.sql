UPDATE public.etiquetas
SET
  status = 'pendente',
  conferido_interno_em = NULL,
  conferido_interno_por = NULL,
  conferido_em = NULL,
  conferido_por = NULL,
  divergencia_motivo = NULL,
  divergencia_por = NULL,
  divergencia_em = NULL
WHERE nf_id IN (
  SELECT id
  FROM public.notas_fiscais
  WHERE numero_nf = '3897274'
);

UPDATE public.notas_fiscais
SET status_entrega = 'NF EM ROTA'
WHERE numero_nf = '3897274';