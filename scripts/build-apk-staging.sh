#!/usr/bin/env bash
# Gera o APK de STAGING assinado.
# RODA EMBUTIDO (capacitor://localhost) — NÃO depende de lovable.app / auth-bridge.
# Diferença para PROD: badge âmbar + VITE_BUILD_ENV=staging + applicationId
# .staging (coexiste com PROD no mesmo aparelho). Atualizar exige novo APK.
# Sufixo `.staging` é oficialmente aceito pela mesma licença Transistorsoft
# emitida para com.orkestria.driver (PROD).
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

echo "==> 2/6 Build do React (vite) — VITE_BUILD_ENV=staging"
VITE_BUILD_ENV=staging npm run build

echo "==> 3/6 Sincronizando Capacitor em modo STAGING (embutido, sem server.url)"
CAP_ENV=staging npx cap sync android

echo "==> 3.5/6 Validando permissões nativas de GPS background"
echo "==> 3.4/6 Injetando licença Transistorsoft se necessário"
ensure_transistorsoft_license

echo "==> 3.5/6 Validando permissões nativas de GPS background"
assert_android_background_gps_ready

echo "==> 3.6/6 Garantindo FQN da MainActivity (fix do crash ClassNotFoundException)"
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
OUT="android/app/build/outputs/apk/release/orkestria-driver-staging-${STAMP}.apk"
cp "$APK_PATH" "$OUT"

echo ""
echo "==> 6/6 OK"
echo "APK STAGING: $OUT  ($SIZE)"
echo ""
echo "Distribua APENAS para o time de homologação. Badge âmbar 'STAGING'."
echo "APK embutido — atualizar exige gerar novo APK (igual PROD)."
