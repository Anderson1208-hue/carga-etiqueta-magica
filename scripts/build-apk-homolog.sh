#!/usr/bin/env bash
# Gera o APK de HOMOLOGAÇÃO assinado.
# O APK aponta para a URL PUBLICADA do Lovable (carga-etiqueta-magica.lovable.app),
# então qualquer "Update" no botão Publish do Lovable já reflete no APK sem
# precisar regerar binário. Use para validar mudanças com o time antes do PROD.
#
# Pré-requisito: keystore configurada conforme docs/APK_BUILD_PRODUCAO.md
set -euo pipefail

echo "==> 1/4 Build do React (vite) — VITE_BUILD_ENV=homolog"
VITE_BUILD_ENV=homolog npm run build

echo "==> 2/4 Sincronizando Capacitor em modo HOMOLOG (server.url=lovable.app)"
CAP_ENV=homolog npx cap sync android

echo "==> 3/4 Gerando APK release assinado"
cd android
./gradlew assembleRelease
cd ..

APK_PATH="android/app/build/outputs/apk/release/app-release.apk"
if [ -f "$APK_PATH" ]; then
  SIZE=$(du -h "$APK_PATH" | cut -f1)
  STAMP=$(date +%Y%m%d-%H%M)
  OUT="android/app/build/outputs/apk/release/motorista-homolog-${STAMP}.apk"
  cp "$APK_PATH" "$OUT"
  echo ""
  echo "==> 4/4 OK"
  echo "APK HOMOLOG: $OUT  ($SIZE)"
  echo ""
  echo "Distribua APENAS para o time de homologação. Badge laranja 'HOMOLOG'"
  echo "aparece dentro do app. Atualizações via Publish do Lovable refletem"
  echo "automaticamente — sem precisar reinstalar."
else
  echo "ERRO: APK não encontrado em $APK_PATH"
  exit 1
fi
