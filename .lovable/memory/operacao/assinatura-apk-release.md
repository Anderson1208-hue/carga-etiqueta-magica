---
name: assinatura-apk-release
description: Pipeline de assinatura release definitiva do APK Motorista — keystore persistente, signing automático, fallback apksigner, bump de versionCode.
type: feature
---
# Assinatura release do APK Motorista

## Setup ÚNICO (uma vez na máquina do dev)
```bash
./scripts/setup-android-signing.sh
```
Esse script é idempotente. Ele:
1. Gera `android/app/motorista-release.keystore` (RSA-2048, validade ~27 anos) se não existir.
2. Cria `android/keystore.properties` com as credenciais (chmod 600).
3. Garante que keystore + properties estão no `.gitignore`.
4. Injeta `signingConfigs.release` + `buildTypes.release.signingConfig` em `android/app/build.gradle` (com backup `.bak.<timestamp>`).

**CRÍTICO:** o `.keystore` e a senha precisam ser guardados em cofre (1Password). Se forem perdidos, NUNCA mais será possível atualizar o app já instalado nos celulares dos motoristas — só desinstalando.

## Build de release (toda vez que for distribuir)
```bash
./scripts/build-apk-release.sh   # PROD    -> orkestria-driver-prod-YYYYMMDD-HHMM.apk
./scripts/build-apk-staging.sh   # STAGING -> orkestria-driver-staging-…apk
```
Ambos executam:
- `bump_version_code` (incrementa o inteiro do versionCode em `android/app/build.gradle` — Android exige > anterior para reconhecer atualização).
- `vite build` com `VITE_BUILD_ENV` apropriado.
- `cap sync` com `CAP_ENV` apropriado.
- `gradlew assembleRelease`.
- `sign_if_needed` (fallback): se `app-release.apk` não saiu (só `app-release-unsigned.apk`), assina via `zipalign` + `apksigner` usando `keystore.properties`. Isso garante que mesmo que o gradle não esteja patcheado o APK final é assinado.
- `verify_signature` (apksigner verify --verbose).
- Cópia para nome carimbado com data/hora.

## Por que isso resolve "app-release-unsigned.apk"
O Capacitor entrega `android/app/build.gradle` SEM `signingConfigs.release`. Sem isso, `assembleRelease` produz só o `-unsigned.apk`. Duas defesas:
1. `setup-android-signing.sh` patcheia o gradle (rota normal — APK já sai assinado).
2. `_apk-sign-lib.sh::sign_if_needed` assina via apksigner se por qualquer motivo o gradle vier limpo (após `cap sync` agressivo, troca de máquina, etc.).

## Garantia de "atualização sem conflito de assinatura"
- Mesma keystore release usada em todo build (PROD e STAGING compartilham).
- `versionCode` sempre incrementado automaticamente.
- `versionName` (visível ao usuário) é editado manualmente em `android/app/build.gradle` quando o dev quiser mudar de "1.0.x" para "1.1.0" etc.

## Arquivos
- `scripts/setup-android-signing.sh` — setup único, interativo (pede senha).
- `scripts/_apk-sign-lib.sh` — funções compartilhadas (`bump_version_code`, `sign_if_needed`, `verify_signature`).
- `scripts/build-apk-release.sh` — pipeline PROD.
- `scripts/build-apk-staging.sh` — pipeline STAGING.
