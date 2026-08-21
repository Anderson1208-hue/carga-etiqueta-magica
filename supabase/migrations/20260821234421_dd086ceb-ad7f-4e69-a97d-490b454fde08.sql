UPDATE public.etiquetas
SET status = 'pendente',
    conferido_em = NULL, conferido_por = NULL,
    conferido_interno_em = NULL, conferido_interno_por = NULL,
    divergencia_motivo = NULL, divergencia_por = NULL, divergencia_em = NULL
WHERE numero_nf = '4033549';