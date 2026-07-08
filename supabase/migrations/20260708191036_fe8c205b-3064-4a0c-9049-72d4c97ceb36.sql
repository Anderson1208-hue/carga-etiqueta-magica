UPDATE public.monitoramento_rotas
SET status = 'finalizada'
WHERE status <> 'finalizada'
  AND data < CURRENT_DATE;