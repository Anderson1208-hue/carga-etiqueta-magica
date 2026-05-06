---
name: gps-tracker-hibrido-capacitor
description: Tracker GPS híbrido — useGpsTrackerHybrid escolhe Foreground Service nativo (APK) ou navigator.geolocation (web) automaticamente.
type: feature
---
# GPS Tracker Híbrido (Capacitor)

## Arquitetura
- `src/hooks/useGpsTracker.ts` — implementação web original (navigator.geolocation). Não mexer.
- `src/hooks/useGpsTrackerNative.ts` — usa `@capacitor-community/background-geolocation` (Foreground Service Android, notificação persistente). Roda só em `Capacitor.isNativePlatform()`.
- `src/hooks/useGpsTrackerHybrid.ts` — seletor automático. **É este o hook a ser usado em qualquer tela nova.**

## Regras
- Mesma assinatura nos 3: `{ monitoramentoRotaId, enabled, paradasCoords?, config? }`.
- Mesma edge function: `processar-gps` (zero mudança no backend).
- Em web continua exigindo aba/PWA em primeiro plano. Em APK Android funciona com tela bloqueada.
- Para o APK funcionar: `AndroidManifest.xml` precisa de `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`.
- Plugin escolhido: `@capacitor-community/background-geolocation` (Apache-2.0, ativo).
- Build Android: `npm run build && npx cap sync android` antes de rodar/gerar APK.

## Onde está plugado
- `src/pages/BaixaEntrega.tsx` — única tela que faz tracking ativo durante rota do motorista.
