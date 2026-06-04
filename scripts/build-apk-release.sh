#!/usr/bin/env bash
# Gera o APK de PRODUÇÃO assinado (embedded /dist, funciona offline).
#
# Pré-requisito (UMA VEZ): ./scripts/setup-android-signing.sh
#
# Garantias deste script:
#   - bumpa versionCode automaticamente (Android exige p/ atualização)
#   - assina com a MESMA keystore release toda vez (sem conflito ao atualizar)
#   - se gradle gerar unsigned, assina via apksigner como fallback
#   - renomeia para motorista-prod-YYYYMMDD-HHMM.apk pronto p/ distribuir
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

echo "==> 2/6 Build do React (vite) — VITE_BUILD_ENV=prod"
VITE_BUILD_ENV=prod npm run build

echo "==> 3/6 Sincronizando Capacitor em modo PROD (sem hot-reload)"
CAP_ENV=prod npx cap sync android

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
OUT="android/app/build/outputs/apk/release/orkestria-driver-prod-${STAMP}.apk"
cp "$APK_PATH" "$OUT"

echo ""
echo "==> 6/6 OK"
echo "APK PROD: $OUT  ($SIZE)"
echo ""
echo "Distribua via Drive/WhatsApp. Oriente o motorista a:"
echo "  - Permitir instalação de fontes desconhecidas"
echo "  - Conceder Localização 'O tempo todo'"
echo "  - Desativar otimização de bateria do app"
