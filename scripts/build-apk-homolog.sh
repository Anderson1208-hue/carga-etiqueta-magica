#!/usr/bin/env bash
# Gera o APK de HOMOLOGAÇÃO assinado.
# RODA EMBUTIDO (capacitor://localhost) — NÃO depende de lovable.app / auth-bridge.
# Diferença para PROD: badge âmbar + VITE_BUILD_ENV=homolog + applicationId
# .homolog (coexiste com PROD no mesmo aparelho). Atualizar exige novo APK.
# Pré-requisito (UMA VEZ): ./scripts/setup-android-signing.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./_apk-sign-lib.sh
source "$SCRIPT_DIR/_apk-sign-lib.sh"

if [ ! -f "android/keystore.properties" ]; then
  echo "ERRO: assinatura não configurada."
  echo "      Rode primeiro: ./scripts/setup-android-signing.sh"
  exit 1
fi

echo "==> 1/6 Bump versionCode"
bump_version_code

echo "==> 2/6 Build do React (vite) — VITE_BUILD_ENV=homolog"
VITE_BUILD_ENV=homolog npm run build

echo "==> 3/6 Sincronizando Capacitor em modo HOMOLOG (server.url=lovable.app)"
CAP_ENV=homolog npx cap sync android

echo "==> 3.5/6 Validando permissões nativas de GPS background"
assert_android_background_gps_ready

echo "==> 4/6 Gerando APK release"
run_android_gradle_release

echo "==> 5/6 Garantindo assinatura"
sign_if_needed

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ ! -f "$APK_PATH" ]; then
  echo "ERRO: APK não encontrado em $APK_PATH"
  exit 1
fi

verify_signature "$APK_PATH"

SIZE=$(du -h "$APK_PATH" | cut -f1)
STAMP=$(date +%Y%m%d-%H%M)
OUT="android/app/build/outputs/apk/release/orkestria-driver-homolog-${STAMP}.apk"
cp "$APK_PATH" "$OUT"

echo ""
echo "==> 6/6 OK"
echo "APK HOMOLOG: $OUT  ($SIZE)"
echo ""
echo "Distribua APENAS para o time de homologação. Badge âmbar 'HOMOLOG'."
echo "Atualizações via Publish do Lovable refletem automaticamente — sem reinstalar."
