---
name: build-apk-producao-fase7
description: Fase 7 — pipeline de build/assinatura/distribuição do APK Motorista (executado no PC do dev).
type: feature
---
# Fase 7 — Build de produção do APK

## Modo dev vs prod no capacitor.config.ts
- Lê `process.env.CAP_ENV`.
- `CAP_ENV=prod` → omite `server.url`. O APK roda `/dist` embutido (necessário para distribuição real).
- Sem `CAP_ENV` ou `CAP_ENV=dev` → mantém `server.url` apontando para o sandbox Lovable (hot-reload em desenvolvimento).

## Artefatos
- `docs/APK_BUILD_PRODUCAO.md` — guia completo: keystore, signing config, manifest, build, sideload, versionamento.
- `scripts/build-apk-release.sh` — automatiza `npm run build` + `CAP_ENV=prod npx cap sync android` + `./gradlew assembleRelease`.

## Pontos críticos para o usuário
- Keystore (`motorista-release.keystore`) e `keystore.properties` NUNCA podem ser commitados nem perdidos.
- Sempre incrementar `versionCode` em `android/app/build.gradle` antes de gerar nova release.
- No celular: pedir "Localização o tempo todo" + remover otimização de bateria (Xiaomi/Huawei/OPPO/Samsung).
- Permissões obrigatórias no AndroidManifest: CAMERA, ACCESS_FINE_LOCATION, ACCESS_BACKGROUND_LOCATION, FOREGROUND_SERVICE, FOREGROUND_SERVICE_LOCATION, POST_NOTIFICATIONS, WAKE_LOCK.

## Rollout do projeto Capacitor — STATUS FINAL
Fase 1 (setup) ✓ · Fase 2 (câmera nativa) ✓ · Fase 3 (scanner ML Kit) ✓ ·
Fase 4 (GPS background) ✓ · Fase 5 (offline robusto) ✓ · Fase 6 (UX polish) ✓ · Fase 7 (build prod) ✓.
