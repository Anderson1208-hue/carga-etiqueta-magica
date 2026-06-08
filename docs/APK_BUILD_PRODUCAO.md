# Fase 7 — Build de Produção do APK Motorista

Guia completo para gerar e distribuir o APK assinado para os motoristas.
Tudo nesta fase é executado **no seu PC** (não no Lovable).

---

## 1. Pré-requisitos (uma única vez)

- Node.js 20+, Java JDK 17, Android Studio + Android SDK
- Variável de ambiente `JAVA_HOME` configurada
- Repositório clonado e dependências instaladas

```bash
git pull
npm install
npx cap add android        # só na primeira vez
```

---

## 2. Gerar o keystore de assinatura (uma única vez na vida do app)

⚠️ **Guarde o arquivo `.keystore` e a senha em local seguro (cofre/1Password).**
Se perder, você nunca mais conseguirá publicar uma atualização que substitua o app instalado.

```bash
keytool -genkey -v \
  -keystore motorista-release.keystore \
  -alias motorista \
  -keyalg RSA -keysize 2048 -validity 10000
```

Mova o arquivo para `android/app/motorista-release.keystore`.

Crie `android/keystore.properties` (NUNCA commite):

```properties
storeFile=motorista-release.keystore
storePassword=SUA_SENHA_AQUI
keyAlias=motorista
keyPassword=SUA_SENHA_AQUI
```

Adicione ao `.gitignore` local:
```
android/keystore.properties
android/app/motorista-release.keystore
```

---

## 3. Configurar assinatura no Gradle

Edite `android/app/build.gradle` e adicione **antes** do bloco `android { ... }`:

```gradle
def keystorePropertiesFile = rootProject.file("keystore.properties")
def keystoreProperties = new Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(new FileInputStream(keystorePropertiesFile))
}
```

Dentro do bloco `android { ... }`, adicione:

```gradle
signingConfigs {
    release {
        if (keystorePropertiesFile.exists()) {
            keyAlias keystoreProperties['keyAlias']
            keyPassword keystoreProperties['keyPassword']
            storeFile file(keystoreProperties['storeFile'])
            storePassword keystoreProperties['storePassword']
        }
    }
}
buildTypes {
    release {
        signingConfig signingConfigs.release
        minifyEnabled false
    }
}
```

---

## 4. Permissões obrigatórias no AndroidManifest

Edite `android/app/src/main/AndroidManifest.xml` e adicione dentro de `<manifest>` (antes de `<application>`):

```xml
<!-- Câmera (POD + scanner) -->
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />
<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />

<!-- GPS Background -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- Wake Lock -->
<uses-permission android:name="android.permission.WAKE_LOCK" />

<!-- Internet -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Push Notifications (FCM) -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="com.google.android.c2dm.permission.RECEIVE" />
```

> **Push (FCM):** o plugin `@capacitor/push-notifications` exige `google-services.json` em `android/app/`. Sem esse arquivo o app compila e roda normal — só não recebe push remoto. Crie projeto no Firebase Console quando quiser ativar.

Ainda no `AndroidManifest.xml`, dentro de `<application>`, adicione a licença Android do Transistorsoft gerada para o `applicationId` do APK (`com.orkestria.driver` em produção):

```xml
<meta-data
    android:name="com.transistorsoft.locationmanager.license"
    android:value="SUA_LICENCA_ANDROID_TRANSISTORSOFT" />
```

Sem essa licença, o plugin funciona apenas em APK debug; APK release pode abrir o app, mas o rastreamento nativo em background não é confiável.

---

## 5. Ícone e Splash Screen

Coloque em `assets/`:
- `icon-only.png` (1024x1024)
- `icon-foreground.png` (1024x1024)
- `icon-background.png` (1024x1024) — fundo `#0f172a`
- `splash.png` (2732x2732) — logo centralizada em fundo `#0f172a`

Gere todos os tamanhos automaticamente:

```bash
npx @capacitor/assets generate \
  --iconBackgroundColor '#0f172a' \
  --iconBackgroundColorDark '#0f172a' \
  --splashBackgroundColor '#0f172a' \
  --splashBackgroundColorDark '#0f172a'
```

---

## 6. Build do APK de PRODUÇÃO

```bash
# 1. Build do React (gera /dist)
npm run build

# 2. Sincroniza /dist + plugins nativos para o Android (modo prod = sem hot-reload)
CAP_ENV=prod npx cap sync android

# 3. Gera o APK assinado
cd android
./gradlew assembleRelease

# APK final estará em:
# android/app/build/outputs/apk/release/app-release.apk
```

No Windows (PowerShell):
```powershell
$env:CAP_ENV="prod"; npx cap sync android
cd android
./gradlew.bat assembleRelease
```

---

## 7. Verificar a assinatura antes de distribuir

```bash
$ANDROID_HOME/build-tools/<versão>/apksigner verify --verbose \
  android/app/build/outputs/apk/release/app-release.apk
```

Deve responder `Verified using v2 scheme: true`.

---

## 8. Distribuição aos motoristas (sideload)

1. Renomeie o APK: `motorista-v1.0.0.apk` (sempre incremente a versão).
2. Suba para Google Drive / WhatsApp / link interno.
3. No celular do motorista:
   - **Configurações → Segurança → Permitir instalação de fontes desconhecidas** (para o navegador/WhatsApp).
   - Baixe o APK e toque para instalar.
   - Após instalar, abra o app uma vez para conceder:
     - Câmera
     - Localização → escolher **"Permitir o tempo todo"** (crítico para GPS background)
     - Notificações
   - **Configurações → Apps → Motorista → Bateria → Sem restrições** (essencial em Xiaomi/Huawei/OPPO/Samsung One UI).

---

## 9. Versionamento

A cada novo APK, edite `android/app/build.gradle`:

```gradle
versionCode 2          // incrementar SEMPRE (inteiro)
versionName "1.0.1"    // semver visível ao usuário
```

`versionCode` é o que o Android usa para detectar atualização. Precisa ser maior que o anterior.

---

## 10. Checklist final antes de mandar para os motoristas

- [ ] `CAP_ENV=prod` ao rodar `cap sync` (sem isso o APK aponta para o sandbox Lovable e quebra quando ele dorme)
- [ ] APK assinado com a release keystore (não a debug)
- [ ] Versão (`versionCode` + `versionName`) incrementada
- [ ] Testado em **um celular real** antes de distribuir em massa:
  - [ ] Login com código de 6 chars funciona
  - [ ] Conferência externa lê QR (botão "Scanner Nativo ML Kit")
  - [ ] Baixa de entrega abre câmera nativa e sobe foto
  - [ ] GPS continua enviando com o celular bloqueado por 5 min andando
  - [ ] Modo avião → 3 baixas → religar internet → tudo sincroniza sozinho

---

## Atualizações futuras

Para uma nova versão é só repetir os passos 6–8. O motorista instala o novo APK por cima e os dados pendentes (IndexedDB) são preservados.
