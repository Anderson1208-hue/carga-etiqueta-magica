#!/usr/bin/env bash
# Assina o APK HOMOLOG já gerado pelo Gradle manual.
# Use este script quando você já rodou:
#   ./android/gradlew.bat -p android assembleRelease   (Windows / Git Bash)
#   ./android/gradlew assembleRelease                  (Linux/macOS)
# e tem em mãos:
#   android/app/build/outputs/apk/release/app-release-unsigned.apk
#
# Este script NÃO chama Gradle e NÃO precisa de javac — só de apksigner
# (Android SDK build-tools) e da keystore configurada em
# android/keystore.properties (gerada por ./scripts/setup-android-signing.sh).
#
# JAVA_HOME pode apontar tanto para um JDK quanto para um JRE — qualquer um
# que tenha bin/java[.exe] serve para o apksigner.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=./_apk-sign-lib.sh
source "$SCRIPT_DIR/_apk-sign-lib.sh"

RELEASE_DIR="android/app/build/outputs/apk/release"
UNSIGNED="$RELEASE_DIR/app-release-unsigned.apk"
SIGNED="$RELEASE_DIR/app-release.apk"

if [ ! -f "$UNSIGNED" ] && [ ! -f "$SIGNED" ]; then
  echo "ERRO: nenhum APK encontrado em $RELEASE_DIR"
  echo "      Rode antes: ./android/gradlew.bat -p android assembleRelease"
  exit 1
fi

if [ ! -f "android/keystore.properties" ]; then
  echo "ERRO: assinatura não configurada."
  echo "      Rode primeiro: ./scripts/setup-android-signing.sh"
  exit 1
fi

# Se vier somente o unsigned (caso comum quando gradle não tem signingConfig),
# remove qualquer .apk assinado antigo para forçar sign_if_needed a rodar.
if [ -f "$UNSIGNED" ] && [ -f "$SIGNED" ]; then
  # Se o assinado é mais antigo que o unsigned, regerar.
  if [ "$UNSIGNED" -nt "$SIGNED" ]; then
    echo "==> APK assinado está desatualizado — removendo para reassinar"
    rm -f "$SIGNED"
  fi
fi

echo "==> Assinando APK HOMOLOG"
sign_if_needed

if [ ! -f "$SIGNED" ]; then
  echo "ERRO: assinatura falhou — $SIGNED não foi gerado"
  exit 1
fi

verify_signature "$SIGNED"

SIZE=$(du -h "$SIGNED" | cut -f1)
STAMP=$(date +%Y%m%d-%H%M)
OUT="$RELEASE_DIR/orkestria-driver-homolog-${STAMP}.apk"
cp "$SIGNED" "$OUT"

echo ""
echo "==> OK"
echo "APK HOMOLOG assinado: $OUT  ($SIZE)"
