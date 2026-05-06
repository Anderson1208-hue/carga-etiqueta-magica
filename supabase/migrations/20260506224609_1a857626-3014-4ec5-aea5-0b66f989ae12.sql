ALTER TABLE public.monitoramento_config
  ALTER COLUMN intervalo_padrao_segundos SET DEFAULT 120,
  ALTER COLUMN intervalo_critico_segundos SET DEFAULT 60;

UPDATE public.monitoramento_config
   SET intervalo_padrao_segundos = 120
 WHERE intervalo_padrao_segundos = 60;

UPDATE public.monitoramento_config
   SET intervalo_critico_segundos = 60
 WHERE intervalo_critico_segundos = 30;