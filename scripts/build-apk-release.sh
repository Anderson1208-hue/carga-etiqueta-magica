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

echo "==> 4/6 Gerando APK release"

# Auto-detecta JAVA_HOME no Windows (Git Bash) se não estiver setado ou inválido
detect_java_home() {
  # Já setado e válido?
  if [ -n "${JAVA_HOME:-}" ]; then
    local jh_unix="${JAVA_HOME}"
    # converte C:\foo -> /c/foo se necessário
    case "$jh_unix" in
      [A-Za-z]:\\*|[A-Za-z]:/*)
        jh_unix="/$(echo "$jh_unix" | sed -e 's|\\|/|g' -e 's|^\([A-Za-z]\):|\L\1|')"
        ;;
    esac
    if [ -x "$jh_unix/bin/java" ] || [ -x "$jh_unix/bin/java.exe" ]; then
      export JAVA_HOME="$jh_unix"
      return 0
    fi
  fi
  # Candidatos comuns no Windows
  local candidates=(
    "/c/jbr"
    "/c/Program Files/Android/Android Studio/jbr"
    "/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot"
    "/c/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot"
    "/c/Program Files/Java/jdk-21"
    "/c/Program Files/Java/jdk-17"
  )
  for c in "${candidates[@]}"; do
    if [ -x "$c/bin/java" ] || [ -x "$c/bin/java.exe" ]; then
      export JAVA_HOME="$c"
      echo "[info] JAVA_HOME auto-detectado: $JAVA_HOME"
      return 0
    fi
  done
  echo "ERRO: não encontrei Java. Instale o JBR do Android Studio ou defina JAVA_HOME."
  exit 1
}
detect_java_home
export PATH="$JAVA_HOME/bin:$PATH"

( cd android && ./gradlew assembleRelease )

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
OUT="android/app/build/outputs/apk/release/motorista-prod-${STAMP}.apk"
cp "$APK_PATH" "$OUT"

echo ""
echo "==> 6/6 OK"
echo "APK PROD: $OUT  ($SIZE)"
echo ""
echo "Distribua via Drive/WhatsApp. Oriente o motorista a:"
echo "  - Permitir instalação de fontes desconhecidas"
echo "  - Conceder Localização 'O tempo todo'"
echo "  - Desativar otimização de bateria do app"
