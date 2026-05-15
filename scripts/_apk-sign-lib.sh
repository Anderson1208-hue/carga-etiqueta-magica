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
