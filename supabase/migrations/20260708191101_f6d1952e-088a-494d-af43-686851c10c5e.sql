UPDATE public.monitoramento_rotas
SET status = 'finalizada'
WHERE status <> 'finalizada'
  AND data < DATE '2026-07-08';