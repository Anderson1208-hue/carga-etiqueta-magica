---
name: ambientes-apk-motorista
description: Estrutura de 3 ambientes (DEV/STAGING/PROD) do APK Motorista — mesmo backend, server.url e badge diferentes.
type: feature
---
# Ambientes do APK Motorista

## Resumo
Um único backend Lovable Cloud (Supabase). Três variações de APK que diferem em **onde o WebView carrega o frontend** e **applicationId** (para coexistirem no mesmo aparelho):

| Ambiente | `CAP_ENV` | `VITE_BUILD_ENV` | applicationId | Frontend carregado de | Badge |
|----------|-----------|------------------|---------------|-----------------------|-------|
| DEV      | `dev` (default) | `dev`     | `com.orkestria.driver.staging` | sandbox `lovableproject.com` (hot-reload, só `npx cap run`) | vermelho |
| STAGING  | `staging` | `staging` | `com.orkestria.driver.staging` | `/dist` embutido (`capacitor://localhost`) | âmbar |
| PROD     | `prod`    | `prod`    | `com.orkestria.driver`         | `/dist` embutido (`capacitor://localhost`) | verde |

**REGRA CRÍTICA:** APKs distribuídos (STAGING e PROD) NUNCA podem ter `server.url`
apontando para `lovable.app` / `lovableproject.com`. Isso abre `lovable.dev/login`
no celular e quebra o fluxo do motorista (que entra por código de 6 chars em
`/motorista`, sem auth Lovable). `server.url` só é permitido em DEV via
`npx cap run android` na máquina do dev.

PROD e STAGING têm `applicationId` distintos → coexistem no mesmo aparelho.

## Licença Transistorsoft
A licença Android Transistorsoft é emitida para o `applicationId` PROD
(`com.orkestria.driver`) e o sufixo **`.staging`** está na lista oficial de
sufixos aceitos automaticamente pela mesma licença (junto com `.dev`, `.debug`,
`.qa`, `.uat`, `.test`). Portanto: **uma única licença cobre PROD + STAGING +
DEV**. Não comprar segunda licença.

## Arquivos chave
- `capacitor.config.ts` — `SERVER_BY_ENV`: só `dev` tem url; `staging` e `prod` = `undefined`.
- `src/components/mobile/BuildModeBadge.tsx` — lê `VITE_BUILD_ENV`.
- `scripts/build-apk-release.sh` — PROD embutido.
- `scripts/build-apk-staging.sh` — STAGING embutido (mesma mecânica do PROD, só muda badge/appId).

## Diferença STAGING vs PROD
Apenas badge âmbar + `VITE_BUILD_ENV=staging` + `applicationId .staging`. Ambos
embutidos. Atualizar STAGING exige gerar novo APK (não há hot-update via Publish).

## Como usar (na máquina do dev)
```bash
# Dev local (hot-reload do sandbox)
npx cap run android        # CAP_ENV vazio = dev

# Gerar APK staging
./scripts/build-apk-staging.sh

# Gerar APK prod (após validação no staging)
./scripts/build-apk-release.sh
```

## Backend
**Não há backend de homologação.** Operadores e motoristas reais estão no mesmo Supabase. Para isolar dados de teste use códigos de acesso e veículos marcados (ex.: placa `TESTE-01`). Dois backends seria custoso e exigiria sync manual de schema/migrations.
