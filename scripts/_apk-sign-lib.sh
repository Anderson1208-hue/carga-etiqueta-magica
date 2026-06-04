#!/usr/bin/env bash
# Biblioteca compartilhada pelos scripts build-apk-*.sh
# Garante assinatura automática mesmo se o build.gradle vier sem signingConfig
# (faz fallback para apksigner direto sobre o app-release-unsigned.apk).

set -euo pipefail

# Bumpa versionCode automaticamente em android/app/build.gradle.
# versionName mantém o que estiver lá (você edita manualmente quando quiser
# mudar o "1.0.x" visível ao usuário).
bump_version_code() {
  local gradle="android/app/build.gradle"
  [ -f "$gradle" ] || return 0
  local current
  current=$(grep -E "^\s*versionCode\s+[0-9]+" "$gradle" | head -1 | grep -oE "[0-9]+")
  if [ -z "$current" ]; then
    echo "AVISO: versionCode não encontrado em $gradle"
    return 0
  fi
  local next=$((current + 1))
  # macOS sed precisa de '' depois de -i; gnu sed não. Usamos arquivo temp.
  awk -v cur="$current" -v nxt="$next" '
    BEGIN{done=0}
    {
      if (!done && match($0, /^[[:space:]]*versionCode[[:space:]]+[0-9]+/)) {
        sub(/[0-9]+/, nxt); done=1
      }
      print
    }' "$gradle" > "$gradle.tmp" && mv "$gradle.tmp" "$gradle"
  echo "==> versionCode bump: $current -> $next"
}

# Auto-detecta JAVA_HOME no Windows (Git Bash/WSL) se não estiver setado ou inválido.
prepare_java_home() {
  if [ -n "${JAVA_HOME:-}" ]; then
    local jh_unix="${JAVA_HOME}"
    case "$jh_unix" in
      [A-Za-z]:\\*|[A-Za-z]:/*)
        if [ -d /mnt/c ]; then
          jh_unix="/mnt/$(echo "$jh_unix" | sed -e 's|\\|/|g' -e 's|^\([A-Za-z]\):|\L\1|')"
        else
          jh_unix="/$(echo "$jh_unix" | sed -e 's|\\|/|g' -e 's|^\([A-Za-z]\):|\L\1|')"
        fi
        ;;
    esac
    if [ -x "$jh_unix/bin/java" ] || [ -x "$jh_unix/bin/java.exe" ]; then
      export JAVA_HOME="$jh_unix"
      export PATH="$JAVA_HOME/bin:$PATH"
      return 0
    fi
  fi

  local candidates=(
    "/mnt/c/jbr"
    "/mnt/c/Program Files/Android/Android Studio/jbr"
    "/mnt/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot"
    "/mnt/c/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot"
    "/mnt/c/Program Files/Java/jdk-21"
    "/mnt/c/Program Files/Java/jdk-17"
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
      export PATH="$JAVA_HOME/bin:$PATH"
      echo "[info] JAVA_HOME auto-detectado: $JAVA_HOME"
      return 0
    fi
  done

  echo "ERRO: não encontrei Java. Instale o JBR do Android Studio ou defina JAVA_HOME."
  exit 1
}

to_windows_path() {
  local p="$1"
  if command -v cygpath >/dev/null 2>&1; then
    cygpath -w "$p"
  elif command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$p"
  else
    echo "$p" | sed -E 's|^/mnt/([a-z])/(.*)|\U\1:\\\2|; s|^/([a-z])/(.*)|\U\1:\\\2|' | sed 's|/|\\|g'
  fi
}

run_android_gradle_release() {
  prepare_java_home
  if [ -x "$JAVA_HOME/bin/java.exe" ] && [ ! -x "$JAVA_HOME/bin/java" ] && command -v cmd.exe >/dev/null 2>&1; then
    local java_home_win android_dir_win
    java_home_win="$(to_windows_path "$JAVA_HOME")"
    android_dir_win="$(to_windows_path "$(pwd)/android")"
    echo "[info] Usando Gradle Windows com JAVA_HOME=$java_home_win"
    cmd.exe /c "cd /d \"$android_dir_win\" && set \"JAVA_HOME=$java_home_win\" && set \"PATH=$java_home_win\\bin;%PATH%\" && gradlew.bat assembleRelease"
  else
    ( cd android && ./gradlew assembleRelease )
  fi
}

assert_android_background_gps_ready() {
  local manifest="android/app/src/main/AndroidManifest.xml"
  if [ ! -f "$manifest" ]; then
    echo "ERRO: $manifest não encontrado. Rode 'npx cap sync android' antes."
    exit 1
  fi

  local missing=0
  check_manifest_item() {
    local needle="$1"
    local label="$2"
    if ! grep -q "$needle" "$manifest"; then
      echo "ERRO: AndroidManifest.xml sem $label"
      missing=1
    fi
  }

  check_manifest_item "android.permission.ACCESS_FINE_LOCATION" "ACCESS_FINE_LOCATION"
  check_manifest_item "android.permission.ACCESS_COARSE_LOCATION" "ACCESS_COARSE_LOCATION"
  check_manifest_item "android.permission.ACCESS_BACKGROUND_LOCATION" "ACCESS_BACKGROUND_LOCATION"
  check_manifest_item "android.permission.FOREGROUND_SERVICE" "FOREGROUND_SERVICE"
  check_manifest_item "android.permission.FOREGROUND_SERVICE_LOCATION" "FOREGROUND_SERVICE_LOCATION"
  check_manifest_item "android.permission.POST_NOTIFICATIONS" "POST_NOTIFICATIONS"
  check_manifest_item "android.permission.WAKE_LOCK" "WAKE_LOCK"
  check_manifest_item "android.permission.CAMERA" "CAMERA"

  if [ "$missing" -ne 0 ]; then
    echo ""
    echo "Build bloqueado: esse APK iria falhar em GPS com tela bloqueada."
    echo "Adicione as permissões acima dentro de <manifest>, antes de <application>."
    echo "Referência: docs/APK_BUILD_PRODUCAO.md seção 'Permissões obrigatórias no AndroidManifest'."
    exit 1
  fi
}

# Assina manualmente um APK unsigned via apksigner se o gradle não assinou.
sign_if_needed() {
  local release_dir="android/app/build/outputs/apk/release"
  local signed="$release_dir/app-release.apk"
  local unsigned="$release_dir/app-release-unsigned.apk"

  if [ -f "$signed" ]; then
    return 0
  fi
  if [ ! -f "$unsigned" ]; then
    echo "ERRO: nenhum APK encontrado em $release_dir"
    return 1
  fi

  echo "==> APK saiu unsigned — assinando via apksigner como fallback"

  if [ ! -f "android/keystore.properties" ]; then
    echo "ERRO: android/keystore.properties não existe."
    echo "      Rode ./scripts/setup-android-signing.sh primeiro."
    return 1
  fi

  # Carrega credenciais
  local KS_FILE KS_PASS KEY_ALIAS KEY_PASS
  KS_FILE=$(grep -E "^storeFile=" android/keystore.properties | cut -d= -f2-)
  KS_PASS=$(grep -E "^storePassword=" android/keystore.properties | cut -d= -f2-)
  KEY_ALIAS=$(grep -E "^keyAlias=" android/keystore.properties | cut -d= -f2-)
  KEY_PASS=$(grep -E "^keyPassword=" android/keystore.properties | cut -d= -f2-)

  local KS_ABS="android/app/$KS_FILE"
  if [ ! -f "$KS_ABS" ]; then
    echo "ERRO: keystore $KS_ABS não encontrado."
    return 1
  fi

  # Localiza apksigner e zipalign no SDK
  local SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
  local BT
  BT=$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)
  if [ -z "$BT" ] || [ ! -x "$BT/apksigner" ]; then
    echo "ERRO: apksigner não encontrado. Instale Android SDK build-tools."
    echo "      Procurado em: $SDK/build-tools/*/apksigner"
    return 1
  fi

  local aligned="$release_dir/app-release-aligned.apk"
  "$BT/zipalign" -p -f 4 "$unsigned" "$aligned"

  "$BT/apksigner" sign \
    --ks "$KS_ABS" \
    --ks-key-alias "$KEY_ALIAS" \
    --ks-pass "pass:$KS_PASS" \
    --key-pass "pass:$KEY_PASS" \
    --out "$signed" \
    "$aligned"

  rm -f "$aligned"
  echo "==> Assinado: $signed"
}

# Verifica assinatura v2/v3 (obrigatório p/ Android 7+).
verify_signature() {
  local apk="$1"
  local SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
  local BT
  BT=$(ls -d "$SDK"/build-tools/* 2>/dev/null | sort -V | tail -1)
  if [ -n "$BT" ] && [ -x "$BT/apksigner" ]; then
    echo "==> Verificando assinatura"
    "$BT/apksigner" verify --verbose "$apk" | grep -E "Verified|Signed" || true
  fi
}
