---
name: ambientes-apk-motorista
description: Estrutura de 3 ambientes (DEV/HOMOLOG/PROD) do APK Motorista — mesmo backend, server.url e badge diferentes.
type: feature
---
# Ambientes do APK Motorista

## Resumo
Um único backend Lovable Cloud (Supabase). Três variações de APK que diferem apenas em **onde o WebView carrega o frontend**:

| Ambiente | `CAP_ENV` | `VITE_BUILD_ENV` | Frontend carregado de | Quem usa | Badge |
|----------|-----------|------------------|-----------------------|----------|-------|
| DEV      | `dev` (default) | `dev`     | sandbox `2b66d97b-…lovableproject.com` (hot-reload) | Desenvolvedor | vermelho |
| HOMOLOG  | `homolog` | `homolog` | URL publicada `carga-etiqueta-magica.lovable.app`   | Time de testes | âmbar |
| PROD     | `prod`    | `prod`    | `/dist` embutido (`capacitor://localhost`)          | Motoristas em rua | verde |

Web no navegador continua mostrando badge azul `WEB` por inferência.

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
