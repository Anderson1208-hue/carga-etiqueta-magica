---
name: smart-gps-tracking-logic
description: Lógica de envio dinâmico de GPS — modo normal 120s, modo crítico (perto da próxima parada) 60s.
type: feature
---
# Smart GPS Tracking

- Defaults atualizados (06/05/2026): **modo normal 120s**, **modo crítico 60s**.
  - Antes era 60s/30s — reduzido para metade para economizar bateria, dados e custo Supabase sem perda operacional (geofence chega no máx 60s atrasado, suficiente para registro de tempo de permanência).
- Modo crítico ativa quando distância para próxima parada < `raio_aproximacao_metros` (default 500m).
- Valores configuráveis em `monitoramento_config` (UI: ConfigDialog em /monitoramento).
- Implementado em `useGpsTracker.ts` (web) e `useGpsTrackerNative.ts` (APK Capacitor). Ambos consomem o mesmo `MonitoramentoConfig`.
- Default da coluna no banco também é 120/60 — registros existentes foram migrados.
