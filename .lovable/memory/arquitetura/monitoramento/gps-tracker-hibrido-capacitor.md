---
name: gps-tracker-hibrido-capacitor
description: Tracker GPS híbrido — useGpsTrackerHybrid escolhe Transistorsoft (APK, padrão), community-bg (fallback) ou navigator.geolocation (web) automaticamente.
type: feature
---
# GPS Tracker Híbrido (Capacitor)

## Arquitetura
- `src/hooks/useGpsTracker.ts` — implementação web (navigator.geolocation). Não mexer.
- `src/hooks/useGpsTrackerTransistor.ts` — **DRIVER PADRÃO no APK.** Usa `@transistorsoft/capacitor-background-geolocation` v9. Resolve tela bloqueada, Doze Mode e fabricantes agressivos (Xiaomi/Huawei/Samsung/Motorola). Funciona em debug SEM licença; release exibe banner "evaluation only" mas continua coletando — suficiente para validar.
- `src/hooks/useGpsTrackerNative.ts` — implementação anterior com `@capacitor-community/background-geolocation`. Mantido como FALLBACK via `VITE_GPS_DRIVER=community`.
- `src/hooks/useGpsTrackerHybrid.ts` — seletor automático. **É este o hook a ser usado em qualquer tela nova.**

## Driver selection
- Default: `transistor`.
- Para forçar o community plugin: build com `VITE_GPS_DRIVER=community`.
- Web sempre usa `useGpsTracker`.

## Regras
- Mesma assinatura nos 4 hooks: `{ monitoramentoRotaId, enabled, paradasCoords?, config? }`.
- Mesma edge function: `processar-gps` (zero mudança no backend).
- Plugin Transistorsoft NÃO usa o uploader HTTP próprio — `http.autoSync=false` e `http.batchSync=false`. Posições entram em `src/lib/gpsQueue.ts` (IndexedDB) e são drenadas por `useGpsQueueWorker` (mesmo fluxo do driver anterior — preserva dedup, retry exponencial e batching).
- Plugin Transistorsoft config: `app.stopOnTerminate=false`, `app.startOnBoot=true`, `app.enableHeadless=true`, `geolocation.locationAuthorizationRequest='Always'`, `notification.sticky=true`.
- Para o APK funcionar (qualquer driver): `AndroidManifest.xml` precisa de `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, `RECEIVE_BOOT_COMPLETED` (para startOnBoot do Transistorsoft).
- Build Android: `npm run build && npx cap sync android` antes de rodar/gerar APK.

## Onde está plugado
- `src/pages/BaixaEntrega.tsx` — tela operacional do motorista.
- `src/pages/MotoristaDiagnostico.tsx` — tela de diagnóstico.

## Licença Transistorsoft (futura)
- Fase 1 (atual): integração em HOMOLOG/debug sem licença para validar tela bloqueada.
- Fase 2 (após validação): comprar licença Android release (~$300 USD única) emitida para `com.orkestria.driver` e adicionar a chave em `android/app/src/main/AndroidManifest.xml` via `<meta-data android:name="com.transistorsoft.locationmanager.license" android:value="..." />`.
