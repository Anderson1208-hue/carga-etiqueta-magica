#!/usr/bin/env bash
# Gera APK HOMOLOG assinado.
# Reproduz exatamente o APK MOTORISTA-homolog-assinado.apk que funcionou em
# campo: appId com.orkestria.driver.homolog + driver
# @capacitor-community/background-geolocation (SEM Transistorsoft).
# Coexiste com PROD e STAGING no mesmo aparelho.
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

echo "==> 3/6 Sincronizando Capacitor em modo HOMOLOG (embutido, sem server.url)"
CAP_ENV=homolog npx cap sync android

ensure_transistorsoft_license

echo "==> 3.5/6 Validando permissões nativas de GPS background"
assert_android_background_gps_ready

echo "==> Garantindo FQN da MainActivity"
assert_main_activity_fqn

echo "==> 4/6 Gerando APK release"
assert_gradle_wrapper
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
echo "Driver GPS: @capacitor-community/background-geolocation (sem Transistorsoft)."
echo "appId: com.orkestria.driver.homolog (coexiste com PROD e STAGING)."
