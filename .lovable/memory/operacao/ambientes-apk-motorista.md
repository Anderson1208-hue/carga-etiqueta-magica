---
name: ambientes-apk-motorista
description: Estrutura de 3 ambientes (DEV/HOMOLOG/PROD) do APK Motorista — mesmo backend, server.url e badge diferentes.
type: feature
---
# Ambientes do APK Motorista

## Resumo
Um único backend Lovable Cloud (Supabase). Três variações de APK que diferem em **onde o WebView carrega o frontend** e **applicationId** (para coexistirem no mesmo aparelho):

| Ambiente | `CAP_ENV` | `VITE_BUILD_ENV` | applicationId | Frontend carregado de | Badge |
|----------|-----------|------------------|---------------|-----------------------|-------|
| DEV      | `dev` (default) | `dev`     | `com.expressoebenezer.motorista.homolog` | sandbox `lovableproject.com` (hot-reload) | vermelho |
| HOMOLOG  | `homolog` | `homolog` | `com.expressoebenezer.motorista.homolog` | URL publicada `carga-etiqueta-magica.lovable.app` | âmbar |
| PROD     | `prod`    | `prod`    | `com.expressoebenezer.motorista`         | `/dist` embutido (`capacitor://localhost`) | verde |

PROD e HOMOLOG têm `applicationId` distintos → podem ser instalados lado a lado no mesmo celular sem conflito de assinatura/atualização. `appId` é definido em `capacitor.config.ts` via `APP_ID_BY_ENV` e propagado para `android/app/build.gradle` pelo `cap sync`.

## Arquivos chave
- `capacitor.config.ts` — lê `process.env.CAP_ENV`, mapa `SERVER_BY_ENV` com 3 entradas. PROD omite `server`.
- `src/components/mobile/BuildModeBadge.tsx` — lê `import.meta.env.VITE_BUILD_ENV` (fonte primária) com fallback por hostname.
- `src/vite-env.d.ts` — declara `VITE_BUILD_ENV: "dev" | "homolog" | "prod"`.
- `scripts/build-apk-release.sh` — `VITE_BUILD_ENV=prod npm run build && CAP_ENV=prod npx cap sync android && assembleRelease`. Copia para `motorista-prod-YYYYMMDD-HHMM.apk`.
- `scripts/build-apk-homolog.sh` — equivalente com `homolog`. Saída `motorista-homolog-…apk`.

## Vantagem do HOMOLOG
APK aponta para a URL publicada do Lovable. Cada `Publish → Update` no editor reflete imediatamente no APK instalado, **sem regerar binário**. O time valida mudanças num celular real antes de você gerar o PROD embedded final.

## Como usar (na máquina do dev)
```bash
# Dev local (hot-reload do sandbox)
npx cap run android        # CAP_ENV vazio = dev

# Gerar APK homolog
./scripts/build-apk-homolog.sh

# Gerar APK prod (após validação no homolog)
./scripts/build-apk-release.sh
```

## Backend
**Não há backend de homologação.** Operadores e motoristas reais estão no mesmo Supabase. Para isolar dados de teste use códigos de acesso e veículos marcados (ex.: placa `TESTE-01`). Dois backends seria custoso e exigiria sync manual de schema/migrations.
