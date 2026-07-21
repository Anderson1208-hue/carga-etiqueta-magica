UPDATE public.monitoramento_paradas p
SET raio_geofence_metros = COALESCE(
  (SELECT d.raio_geofence_metros FROM public.destinatarios d WHERE d.cnpj_cpf = p.cnpj_destinatario AND d.raio_geofence_metros IS NOT NULL LIMIT 1),
  500
)
WHERE p.raio_geofence_metros < 500
  AND EXISTS (
    SELECT 1 FROM public.monitoramento_rotas r
    WHERE r.id = p.monitoramento_rota_id
      AND r.data >= CURRENT_DATE - INTERVAL '2 days'
  );

ALTER TABLE public.monitoramento_paradas ALTER COLUMN raio_geofence_metros SET DEFAULT 500;