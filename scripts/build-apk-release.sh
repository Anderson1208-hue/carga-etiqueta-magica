#!/usr/bin/env bash
# Gera o APK de PRODUÇÃO assinado (embedded /dist, funciona offline).
# Pré-requisito: keystore configurada conforme docs/APK_BUILD_PRODUCAO.md
set -euo pipefail

echo "==> 1/4 Build do React (vite) — VITE_BUILD_ENV=prod"
VITE_BUILD_ENV=prod npm run build

echo "==> 2/4 Sincronizando Capacitor em modo PROD (sem hot-reload)"
CAP_ENV=prod npx cap sync android

echo "==> 3/4 Gerando APK release assinado"
cd android
./gradlew assembleRelease
cd ..

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
  SIZE=$(du -h "$APK_PATH" | cut -f1)
  STAMP=$(date +%Y%m%d-%H%M)
  OUT="android/app/build/outputs/apk/release/motorista-prod-${STAMP}.apk"
  cp "$APK_PATH" "$OUT"
  echo ""
  echo "==> 4/4 OK"
  echo "APK PROD: $OUT  ($SIZE)"
  echo ""
  echo "Próximo: distribua via Drive/WhatsApp e oriente o motorista a"
  echo "permitir 'Localização o tempo todo' e desativar otimização de bateria."
else
  echo "ERRO: APK não encontrado em $APK_PATH"
  exit 1
fi
