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

# Valida que um diretório candidato é um JDK real (tem bin/java[.exe] E bin/javac[.exe]).
# Usa -f para arquivos .exe porque em /mnt/c (WSL/Git Bash) o bit de execução
# normalmente não está setado, fazendo -x retornar falso e o auto-detect cair
# em diretórios stub como C:\jbr vazio.
_jdk_is_valid() {
  local d="$1"
  [ -z "$d" ] && return 1
  if [ -f "$d/bin/java.exe" ] && [ -f "$d/bin/javac.exe" ]; then return 0; fi
  if [ -x "$d/bin/java" ]    && [ -x "$d/bin/javac" ];    then return 0; fi
  return 1
}

# Auto-detecta JAVA_HOME no Windows (Git Bash/WSL) se não estiver setado ou inválido.
prepare_java_home() {
  if [ -n "${JAVA_HOME:-}" ]; then
    local jh_unix="${JAVA_HOME%/}"
    jh_unix="${jh_unix%\\}"
    case "$jh_unix" in
      [A-Za-z]:\\*|[A-Za-z]:/*)
        if [ -d /mnt/c ]; then
          jh_unix="/mnt/$(echo "$jh_unix" | sed -e 's|\\|/|g' -e 's|^\([A-Za-z]\):|\L\1|')"
        else
          jh_unix="/$(echo "$jh_unix" | sed -e 's|\\|/|g' -e 's|^\([A-Za-z]\):|\L\1|')"
        fi
        ;;
    esac
    if _jdk_is_valid "$jh_unix"; then
      export JAVA_HOME="$jh_unix"
      export PATH="$JAVA_HOME/bin:$PATH"
      echo "[info] JAVA_HOME (do ambiente): $JAVA_HOME"
      return 0
    else
      echo "[warn] JAVA_HOME='$JAVA_HOME' inválido (sem bin/java+javac). Procurando alternativas..."
    fi
  fi

  # Ordem importa: JDKs completos primeiro; JBR (sem javac) por último apenas como reserva.
  local candidates=(
    "/mnt/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot"
    "/mnt/c/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot"
    "/mnt/c/Program Files/Java/jdk-21"
    "/mnt/c/Program Files/Java/jdk-17"
    "/c/Program Files/Eclipse Adoptium/jdk-21.0.11.10-hotspot"
    "/c/Program Files/Eclipse Adoptium/jdk-17.0.19.10-hotspot"
    "/c/Program Files/Java/jdk-21"
    "/c/Program Files/Java/jdk-17"
    "/mnt/c/Program Files/Android/Android Studio/jbr"
    "/c/Program Files/Android/Android Studio/jbr"
  )
  # NÃO incluir /mnt/c/jbr nem /c/jbr: normalmente são stubs vazios (sem
  # bin/javac), e ainda assim alguns ambientes têm um java.exe placeholder
  # que faz o auto-detect cair errado. Se quiser forçar, exporte JAVA_HOME.

  # Tenta glob para Adoptium com qualquer versão patch
  for base in "/mnt/c/Program Files/Eclipse Adoptium" "/c/Program Files/Eclipse Adoptium"; do
    [ -d "$base" ] || continue
    while IFS= read -r d; do candidates+=("$d"); done < <(ls -d "$base"/jdk-21* "$base"/jdk-17* 2>/dev/null | sort -r)
  done

  for c in "${candidates[@]}"; do
    if _jdk_is_valid "$c"; then
      export JAVA_HOME="$c"
      export PATH="$JAVA_HOME/bin:$PATH"
      echo "[info] JAVA_HOME auto-detectado: $JAVA_HOME"
      return 0
    fi
  done

  echo "ERRO: não encontrei JDK válido. Instale Eclipse Adoptium JDK 17/21 ou defina JAVA_HOME corretamente."
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

# Garante existência do Gradle Wrapper (gradlew/gradlew.bat + gradle/wrapper/*).
# Se faltar, tenta regenerar via `gradle wrapper` (gradle global) ou orienta o dev.
assert_gradle_wrapper() {
  local need_regen=0
  for f in android/gradlew android/gradlew.bat \
           android/gradle/wrapper/gradle-wrapper.jar \
           android/gradle/wrapper/gradle-wrapper.properties; do
    if [ ! -f "$f" ]; then
      echo "[wrapper] faltando: $f"
      need_regen=1
    fi
  done
  [ "$need_regen" -eq 0 ] && return 0

  echo ""
  echo "==> Gradle Wrapper ausente em android/. Tentando regenerar..."

  # Opção A: gradle instalado globalmente
  if command -v gradle >/dev/null 2>&1; then
    ( cd android && gradle wrapper --gradle-version 8.7 --distribution-type all )
    chmod +x android/gradlew 2>/dev/null || true
    echo "==> Wrapper regenerado via 'gradle wrapper'."
    return 0
  fi

  # Opção B: recriar plataforma Android inteira (preserva manifest customizado? NÃO).
  cat <<'EOF'

ERRO: gradlew/gradlew.bat não existe e 'gradle' não está no PATH.

Conserte de UMA das duas formas (faça apenas UMA vez):

  [A] Instalar Gradle global e regenerar wrapper (recomendado):
      Windows:   choco install gradle    (ou baixar de https://gradle.org/install/)
      macOS:     brew install gradle
      Linux:     sdk install gradle 8.7

      Depois:
          cd android
          gradle wrapper --gradle-version 8.7 --distribution-type all
          cd ..
          git add android/gradlew android/gradlew.bat android/gradle/wrapper
          # commit + push para nunca mais faltar

  [B] Recriar a pasta android/ do zero via Capacitor (CUIDADO: perde
      edições manuais no AndroidManifest.xml e build.gradle):
          rm -rf android
          npx cap add android
          npx cap sync android
          ./scripts/setup-android-signing.sh     # reaplica signing config
          # reaplique manualmente as permissões do AndroidManifest.xml

Depois de [A] ou [B], rode novamente este script.
EOF
  exit 1
}

# Licença Transistorsoft (Capacitor Background Geolocation).
# Emitida para com.orkestria.driver, cobre sufixos .staging/.homolog/.dev/.qa/.uat/.test/.debug/.stage/.development.
# Validade: max_build_stamp = 2027-07-18.
# Referência: docs/TRANSISTORSOFT_SETUP.md.
TRANSISTORSOFT_LICENSE_KEY="eyJhbGciOiJFZERTQSIsImtpZCI6ImVkMjU1MTktbWFpbi12MSJ9.eyJvcyI6ImFuZHJvaWQiLCJhcHBfaWQiOiJjb20ub3JrZXN0cmlhLmRyaXZlciIsIm9yZGVyX251bWJlciI6MTY1NzEsInJlbmV3YWxfdXJsIjoiaHR0cHM6Ly9zaG9wLnRyYW5zaXN0b3Jzb2Z0LmNvbS9jYXJ0LzM5MzY3MDcxMjM2MTk5OjE_bm90ZT0xMDk4NCIsImN1c3RvbWVyX2lkIjo5OTgyLCJwcm9kdWN0IjoiY2FwYWNpdG9yLWJhY2tncm91bmQtZ2VvbG9jYXRpb24iLCJrZXlfdmVyc2lvbiI6MSwiYWxsb3dlZF9zdWZmaXhlcyI6WyIuZGV2IiwiLmRldmVsb3BtZW50IiwiLnN0YWdpbmciLCIuc3RhZ2UiLCIucWEiLCIudWF0IiwiLnRlc3QiLCIuZGVidWciXSwibWF4X2J1aWxkX3N0YW1wIjoyMDI3MDcxOCwiZ3JhY2VfYnVpbGRzIjowLCJlbnRpdGxlbWVudHMiOlsiY29yZSJdLCJpYXQiOjE3ODIyNjA5ODh9.GwtqqkOLVWm5c_4jK7aZ4OPju-xvm23elNRRmyS-bM_FA4eCi4Utza8z-OiOWm7DTjGFcZUGPfoGnyFFry9oAg"

# Injeta o <meta-data> da licença Transistorsoft no AndroidManifest.xml se
# ainda não estiver presente. Sem essa meta-data, em release o plugin recusa
# iniciar (ready.enabled=false, requestPermission=Denied), Foreground Service
# não sobe e nenhum ponto com source='transistor-native-http' chega ao backend.
ensure_transistorsoft_license() {
  local manifest="android/app/src/main/AndroidManifest.xml"
  if [ ! -f "$manifest" ]; then
    echo "ERRO: $manifest não encontrado. Rode 'npx cap sync android' antes."
    exit 1
  fi

  if grep -q "com.transistorsoft.locationmanager.license" "$manifest"; then
    if grep -qF "$TRANSISTORSOFT_LICENSE_KEY" "$manifest"; then
      echo "[license] Transistorsoft já presente e confere com a chave versionada"
      return 0
    fi

    echo "==> Atualizando licença Transistorsoft divergente em $manifest"
    awk -v key="$TRANSISTORSOFT_LICENSE_KEY" '
      BEGIN { in_meta=0; has_license_name=0; has_value=0; done=0; buffer="" }

      function flush_buffer(    replacement) {
        if (has_license_name && !done) {
          replacement = "        <meta-data android:name=\"com.transistorsoft.locationmanager.license\" android:value=\"" key "\"/>"
          print replacement
          done=1
        } else {
          printf "%s", buffer
        }
        in_meta=0; has_license_name=0; has_value=0; buffer=""
      }

      {
        if (!in_meta && $0 ~ /<meta-data/) {
          in_meta=1
          has_license_name=0
          has_value=0
          buffer=$0 "\n"
          if ($0 ~ /com\.transistorsoft\.locationmanager\.license/) has_license_name=1
          if ($0 ~ /android:value=/) has_value=1
          if ($0 ~ /\/>|>/) flush_buffer()
          next
        }

        if (in_meta) {
          buffer = buffer $0 "\n"
          if ($0 ~ /com\.transistorsoft\.locationmanager\.license/) has_license_name=1
          if ($0 ~ /android:value=/) has_value=1
          if ($0 ~ /\/>|>/) flush_buffer()
          next
        }

        print
      }

      END { if (in_meta) flush_buffer() }
    ' "$manifest" > "$manifest.tmp" && mv "$manifest.tmp" "$manifest"

    if ! grep -qF "$TRANSISTORSOFT_LICENSE_KEY" "$manifest"; then
      echo "ERRO: licença Transistorsoft existe, mas não consegui substituir pela chave versionada."
      exit 1
    fi
    echo "[license] Transistorsoft atualizada"
    return 0
  fi

  echo "==> Injetando <meta-data> da licença Transistorsoft em $manifest"
  local block="        <meta-data android:name=\"com.transistorsoft.locationmanager.license\" android:value=\"${TRANSISTORSOFT_LICENSE_KEY}\"/>"
  # Insere antes de </application>. Escapa | do awk usando outro delimitador.
  awk -v line="$block" '
    { if ($0 ~ /<\/application>/) print line; print }
  ' "$manifest" > "$manifest.tmp" && mv "$manifest.tmp" "$manifest"

  if ! grep -q "com.transistorsoft.locationmanager.license" "$manifest"; then
    echo "ERRO: falhei ao inserir a licença Transistorsoft no Manifest."
    exit 1
  fi
  echo "[license] Transistorsoft injetada"
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
  check_manifest_item "android.permission.RECEIVE_BOOT_COMPLETED" "RECEIVE_BOOT_COMPLETED"
  check_manifest_item "com.transistorsoft.locationmanager.license" "licença Transistorsoft"

  if [ "$missing" -ne 0 ]; then
    echo ""
    echo "Build bloqueado: esse APK iria falhar em GPS com tela bloqueada."
    echo "Adicione as permissões acima dentro de <manifest>, antes de <application>."
    echo "Referência: docs/APK_BUILD_PRODUCAO.md seção 'Permissões obrigatórias no AndroidManifest'."
    exit 1
  fi
}

# Garante que:
#   1) android/app/build.gradle tem `namespace "com.orkestria.driver"` (fixo,
#      independente do applicationId). Sem isso, o Capacitor gera a
#      MainActivity dentro do package que casa com o applicationId
#      (ex.: com.orkestria.driver.staging.MainActivity) — e o FQN do
#      Manifest (com.orkestria.driver.MainActivity) some, causando
#      ClassNotFoundException no boot.
#   2) MainActivity.java está em android/app/src/main/java/com/orkestria/driver/
#      com `package com.orkestria.driver;`. Se o Capacitor gerou em
#      .staging/.homolog/.dev, movemos e reescrevemos o `package`.
#   3) <activity android:name="..."> usa o FQN absoluto.
assert_main_activity_fqn() {
  local manifest="android/app/src/main/AndroidManifest.xml"
  local gradle="android/app/build.gradle"
  local base_dir="android/app/src/main/java/com/orkestria/driver"
  local fqn="com.orkestria.driver.MainActivity"

  [ -f "$manifest" ] || return 0

  # --- 1) Força namespace fixo no build.gradle (AGP 8+) ---
  if [ -f "$gradle" ]; then
    if grep -qE '^\s*namespace\s+"[^"]+"' "$gradle"; then
      if ! grep -qE '^\s*namespace\s+"com\.orkestria\.driver"\s*$' "$gradle"; then
        echo "==> Forçando namespace fixo com.orkestria.driver em $gradle"
        awk '
          BEGIN{done=0}
          {
            if (!done && match($0, /^[[:space:]]*namespace[[:space:]]+"[^"]+"/)) {
              sub(/"[^"]+"/, "\"com.orkestria.driver\""); done=1
            }
            print
          }' "$gradle" > "$gradle.tmp" && mv "$gradle.tmp" "$gradle"
      fi
    else
      echo "==> Injetando namespace \"com.orkestria.driver\" no bloco android { ... } de $gradle"
      awk '
        BEGIN{done=0}
        {
          print
          if (!done && $0 ~ /^android[[:space:]]*\{/) {
            print "    namespace \"com.orkestria.driver\""
            done=1
          }
        }' "$gradle" > "$gradle.tmp" && mv "$gradle.tmp" "$gradle"
    fi
  fi

  # --- 2) Move MainActivity para o package base e reescreve `package` ---
  mkdir -p "$base_dir"
  local suffix ext
  for suffix in staging homolog dev; do
    local src_dir="android/app/src/main/java/com/orkestria/driver/$suffix"
    for ext in java kt; do
      local src="$src_dir/MainActivity.$ext"
      if [ -f "$src" ]; then
        echo "==> Movendo $src -> $base_dir/MainActivity.$ext (package com.orkestria.driver)"
        sed -E "s|^package[[:space:]]+com\.orkestria\.driver\.$suffix[[:space:]]*;|package com.orkestria.driver;|" \
          "$src" > "$base_dir/MainActivity.$ext"
        rm -f "$src"
        rmdir "$src_dir" 2>/dev/null || true
      fi
    done
  done

  # --- 2b) Fallback: se não existe MainActivity em nenhum lugar, cria do zero.
  # Sem isso, gradle compila o APK sem a classe e Android crasha no boot com
  # ClassNotFoundException: com.orkestria.driver.MainActivity.
  if [ ! -f "$base_dir/MainActivity.java" ] && [ ! -f "$base_dir/MainActivity.kt" ]; then
    echo "==> MainActivity ausente — criando $base_dir/MainActivity.java do zero"
    cat > "$base_dir/MainActivity.java" <<'JAVA_EOF'
package com.orkestria.driver;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {}
JAVA_EOF
  fi

  # --- 2c) Sanidade: garante que o `package` do arquivo bate com o esperado.
  # Se veio com package divergente (ex.: .staging não coberto pelo sed acima
  # por espaços/tab), reescreve. Sem isso o arquivo existe mas o compilador o
  # registra em outro pacote e Android crasha com ClassNotFoundException.
  for ext in java kt; do
    local f="$base_dir/MainActivity.$ext"
    [ -f "$f" ] || continue
    if ! grep -qE "^[[:space:]]*package[[:space:]]+com\.orkestria\.driver[[:space:]]*;?[[:space:]]*$" "$f"; then
      echo "==> Corrigindo declaração 'package' em $f -> com.orkestria.driver"
      awk 'BEGIN{done=0}
        /^[[:space:]]*package[[:space:]]+/{ if(!done){ print "package com.orkestria.driver;"; done=1 } next }
        { if(!done){ print "package com.orkestria.driver;"; done=1 } print }
      ' "$f" > "$f.tmp" && mv "$f.tmp" "$f"
    fi
  done

  # --- 2d) ProGuard keep p/ R8 não descartar MainActivity no release.
  local pg="android/app/proguard-rules.pro"
  if [ -f "$pg" ] && ! grep -q "com.orkestria.driver.MainActivity" "$pg"; then
    echo "==> Adicionando keep rule para MainActivity em $pg"
    printf '\n# Orkestria: manter MainActivity para evitar ClassNotFoundException em release\n-keep class com.orkestria.driver.MainActivity { *; }\n' >> "$pg"
  fi

  # --- 3) Corrige android:name no Manifest ---
  if grep -q "android:name=\"$fqn\"" "$manifest"; then
    echo "[manifest] MainActivity já está com FQN: $fqn"
  elif grep -qE 'android:name="\.MainActivity"|android:name="com\.orkestria\.driver\.(staging|homolog|dev)\.MainActivity"' "$manifest"; then
    echo "==> Corrigindo MainActivity no AndroidManifest.xml para FQN: $fqn"
    sed -i.bak -E \
      -e "s|android:name=\"\.MainActivity\"|android:name=\"$fqn\"|g" \
      -e "s|android:name=\"com\.orkestria\.driver\.(staging\|homolog\|dev)\.MainActivity\"|android:name=\"$fqn\"|g" \
      "$manifest"
    rm -f "$manifest.bak"
    if ! grep -q "android:name=\"$fqn\"" "$manifest"; then
      echo "ERRO: não consegui aplicar FQN no AndroidManifest.xml."
      exit 1
    fi
  fi

  # --- 4) Verificação final: arquivo existe E declara o package correto.
  local ok=0
  for ext in java kt; do
    local f="$base_dir/MainActivity.$ext"
    if [ -f "$f" ] && grep -qE "^[[:space:]]*package[[:space:]]+com\.orkestria\.driver[[:space:]]*;?" "$f"; then
      echo "[ok] $f -> package com.orkestria.driver"
      ok=1
    fi
  done
  if [ "$ok" -ne 1 ]; then
    echo "ERRO: MainActivity.java não ficou válida em $base_dir/. Abortando build."
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
