---
name: transistorsoft-licenca-auto-inject
description: Licença Transistorsoft é injetada automaticamente no AndroidManifest.xml pelos scripts build-apk-*.sh.
type: feature
---
# Licença Transistorsoft — injeção automática

`scripts/_apk-sign-lib.sh` define `TRANSISTORSOFT_LICENSE_KEY` e a função
`ensure_transistorsoft_license`, chamada por `build-apk-staging.sh`,
`build-apk-homolog.sh` e `build-apk-release.sh` antes de
`assert_android_background_gps_ready` e `assert_main_activity_fqn`.

Efeito: se `android/app/src/main/AndroidManifest.xml` não contém
`com.transistorsoft.locationmanager.license`, o script insere o
`<meta-data>` imediatamente antes de `</application>`. Isso resolve o caso
em que a pasta `android/` é recriada (npx cap add android) em outra máquina
(ex.: Manus) e a licença sumiria — sem ela, em release o plugin recusa
iniciar (`ready.enabled=false`, `requestPermission=Denied`, Foreground
Service não sobe, nenhum ponto `source='transistor-native-http'` chega).

Validade: `max_build_stamp = 2027-07-18`. Cobre PROD (`com.orkestria.driver`)
+ sufixos `.staging/.homolog/.dev/.qa/.uat/.test/.debug/.stage/.development`.

Sintoma de licença faltando (visto no APK v1.0.1 build 2 de 06/07/2026):
grep `com.transistorsoft.locationmanager.license` no manifest extraído
retorna vazio. Diagnóstico do motorista mostra `ready.enabled=false` e
`Source último ponto DB: — (nunca)`. Corrigir = regerar APK com o script
atualizado (chave já está versionada no repo).
