# Transistorsoft Background Geolocation — Setup STAGING/PROD

Plugin: `@transistorsoft/capacitor-background-geolocation` (instalado).
Licença Android emitida para `com.orkestria.driver`. Cobre automaticamente
`.staging`, `.dev`, `.qa`, `.uat`, `.test`, `.debug`, `.stage`, `.development`.

Roteamento por ambiente (já configurado em `useGpsTrackerHybrid`):

| Ambiente | Driver GPS               |
|----------|--------------------------|
| web      | navigator.geolocation    |
| dev      | community (fallback)     |
| homolog  | community (fallback)     |
| staging  | **Transistorsoft (HTTP nativo)** |
| prod     | **Transistorsoft (HTTP nativo)** |

Override de debug: `VITE_GPS_DRIVER=community` ou `transistor`.

---

## 1. AndroidManifest.xml

### 1.1 Permissões (validadas automaticamente pelo build)

O script `scripts/_apk-sign-lib.sh` (`assert_android_background_gps_ready`)
bloqueia o build se faltar qualquer permissão obrigatória:

```xml
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION"/>
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE"/>
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_LOCATION"/>
<uses-permission android:name="android.permission.POST_NOTIFICATIONS"/>
<uses-permission android:name="android.permission.WAKE_LOCK"/>
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED"/>
```

### 1.2 Licença Transistorsoft — INJEÇÃO AUTOMÁTICA

**Não é mais necessário colar `<meta-data>` manualmente.** O script
`ensure_transistorsoft_license` (chamado por todos os `build-apk-*.sh`
antes do gradle) injeta o bloco abaixo dentro de `<application>` se ele
não estiver presente:

```xml
<meta-data
    android:name="com.transistorsoft.locationmanager.license"
    android:value="eyJhbGciOi...GnyFFry9oAg"/>
```

A chave fica em `TRANSISTORSOFT_LICENSE_KEY` dentro de `_apk-sign-lib.sh`.
Validade: `max_build_stamp = 2027-07-18`. Cobre PROD + STAGING + DEV.


### 1.3 MainActivity com nome ABSOLUTO (obrigatório para STAGING/HOMOLOG)

Ainda em `android/app/src/main/AndroidManifest.xml`, dentro do `<activity ...>` principal, troque:

```xml
<activity android:name=".MainActivity" ... >
```

por:

```xml
<activity android:name="com.orkestria.driver.MainActivity" ... >
```

**Por quê:** o ponto inicial em `.MainActivity` faz o Android resolver o nome relativo ao `applicationId`. Como STAGING usa `applicationId = com.orkestria.driver.staging`, o sistema procura `com.orkestria.driver.staging.MainActivity`, classe que não existe (o `npx cap add android` gera a classe sempre em `com.orkestria.driver.MainActivity`). Resultado: app crasha no boot com `ClassNotFoundException` / `Unable to instantiate activity`. PROD funciona por coincidência (applicationId == package da classe), mas qualquer build com sufixo (`.staging`, `.homolog`, `.dev`) quebra.

Confira também que o arquivo da classe está em:
`android/app/src/main/java/com/orkestria/driver/MainActivity.java` (ou `.kt`).

O script `./scripts/build-apk-staging.sh` (e os de homolog/release) agora valida e auto-corrige isso antes de buildar — então depois desta correção, builds futuros ficam protegidos automaticamente.

---


## 2. Build STAGING

```bash
git pull
npm install --legacy-peer-deps
# Se ainda não tem android/: npx cap add android
npx cap sync android
./scripts/build-apk-staging.sh
```

Saída: `android/app/build/outputs/apk/release/orkestria-driver-staging-YYYYMMDD-HHMM.apk`

Badge âmbar "STAGING", `applicationId = com.orkestria.driver.staging`,
coexiste com PROD no mesmo aparelho.

---

## 3. Procedimento de teste em campo (STAGING — 1 a 2 dias)

### 3.1 Pré-uso (uma vez por aparelho)
1. Instalar o APK STAGING.
2. Abrir o app, entrar com código do motorista.
3. No wizard `ValidacaoGpsBackground`: conceder **"Permitir o tempo todo"** em Configurações → Apps → Localização.
4. Desativar otimização de bateria para o app (Configurações → Bateria → App → Sem restrição).
5. Aguardar teste de 90s com tela bloqueada — deve passar.

### 3.2 Critérios de aprovação (validar no banco)
Rodar query na Torre/banco enquanto motorista circula com **tela bloqueada**:

```sql
select created_at, source, latitude, longitude, accuracy
from posicoes_gps
where monitoramento_rota_id = '<ID>'
order by created_at desc
limit 50;
```

Esperado:
- `source = 'transistor-native-http'` em pings recentes.
- Sem gaps > 5 min durante deslocamento.
- Posições continuam chegando após app em background + tela apagada.
- Após "swipe-kill" (matar da lista de recentes) o Foreground Service mantém a notificação e o envio retoma.

### 3.3 Sinais de falha
- `source` continua `community-bg` em STAGING → driver não foi roteado, verificar `VITE_BUILD_ENV=staging` no build.
- Banner "evaluation only" no log → licença não está sendo lida; conferir `<meta-data>` no Manifest.
- Posições com gap > 10 min em background → permissão "Always" não concedida ou bateria restringindo.

---

## 4. Arquivos alterados nesta etapa

- `package.json` — adicionado `@transistorsoft/capacitor-background-geolocation`.
- `src/hooks/useGpsTrackerTransistor.ts` — driver completo (HTTP nativo).
- `src/hooks/useGpsTrackerHybrid.ts` — roteamento por `VITE_BUILD_ENV`.
- Headless Java custom fica **desativado** no Capacitor v9: sem uma classe nativa
  `BackgroundGeolocationHeadlessTask`, `enableHeadless=true` pode gerar crash-loop.
  O envio em segundo plano deve ser feito pelo Foreground Service + HTTP nativo do plugin.
- `docs/TRANSISTORSOFT_SETUP.md` — este arquivo.

`AndroidManifest.xml` **NÃO** é versionado no repo Lovable (pasta `android/`
é gerada na sua máquina). A licença precisa ser colada manualmente uma vez —
fica versionada no seu repositório local.

---

## 5. PROD (não gerar agora)

Quando STAGING for aprovado em campo (1–2 dias):

```bash
./scripts/build-apk-release.sh
```

Mesma licença, mesmo `<meta-data>`, mesmo driver. PROD usa `applicationId = com.orkestria.driver` (sem sufixo).
