#!/usr/bin/env bash
# Configuração ÚNICA da assinatura release do APK Motorista.
# Rode este script UMA VEZ na sua máquina, depois nunca mais.
#
# O que ele faz (idempotente — pode rodar de novo sem quebrar):
#   1. Gera o keystore RSA-2048/10000d em android/app/motorista-release.keystore
#      se ainda não existir (pede senha e dados).
#   2. Cria android/keystore.properties com as credenciais.
#   3. Garante que android/keystore.properties e *.keystore estão no .gitignore.
#   4. Injeta o bloco signingConfigs.release + buildTypes.release no
#      android/app/build.gradle (se ainda não estiver lá).
#
# Depois disso, basta rodar ./scripts/build-apk-release.sh quando quiser
# gerar um novo APK assinado e pronto para distribuir.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANDROID_DIR="$ROOT/android"
APP_DIR="$ANDROID_DIR/app"
KEYSTORE_FILE="$APP_DIR/motorista-release.keystore"
PROPS_FILE="$ANDROID_DIR/keystore.properties"
GRADLE_FILE="$APP_DIR/build.gradle"
GITIGNORE="$ROOT/.gitignore"

if [ ! -d "$ANDROID_DIR" ]; then
  echo "ERRO: pasta android/ não existe. Rode 'npx cap add android' primeiro."
  exit 1
fi

# ---------- 1. Keystore ----------
if [ ! -f "$KEYSTORE_FILE" ]; then
  echo "==> Gerando keystore release (válido por ~27 anos)"
  echo "    GUARDE A SENHA EM LOCAL SEGURO (1Password/cofre)."
  echo "    Se você perder este arquivo .keystore OU a senha, NUNCA mais"
  echo "    será possível atualizar o app instalado nos celulares."
  echo ""
  read -r -s -p "Senha do keystore (mínimo 6 chars): " KS_PASS
  echo ""
  read -r -s -p "Confirme a senha: " KS_PASS2
  echo ""
  if [ "$KS_PASS" != "$KS_PASS2" ] || [ ${#KS_PASS} -lt 6 ]; then
    echo "ERRO: senhas não conferem ou muito curtas."
    exit 1
  fi

  keytool -genkeypair -v \
    -keystore "$KEYSTORE_FILE" \
    -alias motorista \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=Motorista Carga Etiqueta Magica, OU=Operacao, O=Logistica, L=Rio de Janeiro, ST=RJ, C=BR"

  echo "OK keystore: $KEYSTORE_FILE"
else
  echo "==> Keystore já existe em $KEYSTORE_FILE — mantendo."
  read -r -s -p "Confirme a senha do keystore existente: " KS_PASS
  echo ""
fi

# ---------- 2. keystore.properties ----------
echo "==> Escrevendo $PROPS_FILE"
cat > "$PROPS_FILE" <<EOF
storeFile=motorista-release.keystore
storePassword=$KS_PASS
keyAlias=motorista
keyPassword=$KS_PASS
EOF
chmod 600 "$PROPS_FILE"

# ---------- 3. .gitignore ----------
touch "$GITIGNORE"
add_ignore() {
  grep -qxF "$1" "$GITIGNORE" || echo "$1" >> "$GITIGNORE"
}
add_ignore "android/keystore.properties"
add_ignore "android/app/motorista-release.keystore"
add_ignore "android/app/build/outputs/apk/release/*.apk"
echo "==> .gitignore atualizado"

# ---------- 4. build.gradle ----------
if [ ! -f "$GRADLE_FILE" ]; then
  echo "ERRO: $GRADLE_FILE não encontrado. Rode 'npx cap sync android' antes."
  exit 1
fi

if grep -q "signingConfigs.release" "$GRADLE_FILE" 2>/dev/null || \
   grep -q "keystoreProperties\['keyAlias'\]" "$GRADLE_FILE"; then
  echo "==> build.gradle já contém signing config — pulando injeção."
else
  echo "==> Injetando signingConfigs.release no build.gradle"
  cp "$GRADLE_FILE" "$GRADLE_FILE.bak.$(date +%s)"

  # Bloco no topo (antes do android { ... })
  TOP_BLOCK='def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
'

  # Bloco dentro de android { ... }
  INNER_BLOCK='    signingConfigs {
        release {
            if (rootProject.file("keystore.properties").exists()) {
                def props = new Properties()
                props.load(new FileInputStream(rootProject.file("keystore.properties")))
                keyAlias props["keyAlias"]
                keyPassword props["keyPassword"]
                storeFile file(props["storeFile"])
                storePassword props["storePassword"]
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
'

  # Injeta INNER_BLOCK logo após "android {"
  python3 - "$GRADLE_FILE" <<PY
import re, sys
path = sys.argv[1]
src = open(path).read()
inner = '''    signingConfigs {
        release {
            if (rootProject.file("keystore.properties").exists()) {
                def props = new Properties()
                props.load(new FileInputStream(rootProject.file("keystore.properties")))
                keyAlias props["keyAlias"]
                keyPassword props["keyPassword"]
                storeFile file(props["storeFile"])
                storePassword props["storePassword"]
            }
        }
    }
    buildTypes {
        release {
            signingConfig signingConfigs.release
            minifyEnabled false
        }
    }
'''
new = re.sub(r'(android\s*\{\s*\n)', r'\1' + inner, src, count=1)
if new == src:
    print("AVISO: não consegui localizar 'android {' — edite manualmente.", file=sys.stderr)
    sys.exit(2)
open(path, "w").write(new)
PY
  echo "OK build.gradle patcheado (backup .bak.* criado)."
fi

echo ""
echo "============================================================"
echo "Setup concluído. Próximos passos:"
echo "  ./scripts/build-apk-release.sh    # gera APK PROD assinado"
echo "  ./scripts/build-apk-homolog.sh    # gera APK HOMOLOG assinado"
echo "============================================================"
