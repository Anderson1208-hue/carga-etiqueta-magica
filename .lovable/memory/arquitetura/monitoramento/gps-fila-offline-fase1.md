---
name: gps-fila-offline-fase1
description: Pipeline GPS resiliente — toda posição passa por fila IndexedDB, worker drena com retry exponencial, heartbeat 60s, dedup server-side via client_ts.
type: feature
---
# GPS Fase 1 — Fila offline + Heartbeat + Auto-restart

## Pipeline
1. `useGpsTrackerNative` (APK) recebe callback do plugin → enfileira em `src/lib/gpsQueue.ts` (IndexedDB store `gps_pending`).
2. `useGpsQueueWorker` roda no APK enquanto há rota ativa, drena a cada 15s e ao evento `online`.
3. Worker envia batch (≤20 itens) por rota para edge `processar-gps`.
4. Sucesso 2xx → remove da fila. Falha → `rescheduleMany` aplica backoff exponencial (1s, 5s, 30s, 2min, 10min, 30min).

## Heartbeat
- A cada 60s o tracker enfileira a última posição com `heartbeat=true`.
- Server: `processar-gps` aceita `heartbeat`. Quando `isHeartbeatOnly`, atualiza `monitoramento_rotas.ultima_atualizacao` mas NÃO roda geofence (evita disparar paradas falsas em motorista parado).

## Auto-restart do watcher
- Supervisor a cada 30s. Se nenhum callback do plugin há > 3 min, reinicia o watcher (stop + start).

## Dedup
- Coluna `posicoes_gps.client_ts` + índice único parcial `(monitoramento_rota_id, client_ts)`.
- Edge usa `upsert(..., { onConflict: "monitoramento_rota_id,client_ts", ignoreDuplicates: true })`.
- Reenvio de batch (após falha de rede) é seguro.

## Onboarding OEM
- `src/components/mobile/PermissoesOnboarding.tsx` — wizard one-time (localStorage `oem_onboarding_v1`).
- Detecta fabricante via UA, mostra dicas específicas (Xiaomi/Samsung/Motorola/Huawei/Oppo).
- Botão "Abrir configurações" usa `BackgroundGeolocation.openSettings()` (plugin já existente).
- Aparece só quando `selectedVeiculoId && monitoramentoRotaId` no `BaixaEntrega`.

## Arquivos
- `src/lib/gpsQueue.ts` — fila + drainQueue.
- `src/hooks/useGpsQueueWorker.ts` — worker.
- `src/hooks/useGpsTrackerNative.ts` — enfileira em vez de fetch direto.
- `src/components/mobile/PermissoesOnboarding.tsx`.
- `supabase/functions/processar-gps/index.ts` — heartbeat + upsert dedup.

## NÃO mexer (web continua igual)
- `useGpsTracker.ts` (web) — mantido. Apenas adicionado `pendingQueue: 0` no return para compatibilidade de tipos com o híbrido.
