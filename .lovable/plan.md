# Plano Técnico: App Android do Motorista via Capacitor

## Objetivo
Transformar o módulo do motorista (`/motorista-acesso`, `/conferencia-externa`, `/baixa-entrega`) em um app Android instalável (APK), com **GPS em segundo plano** via foreground service, **câmera nativa** para POD e **armazenamento offline**. O sistema web atual (CD, roteirização, painel, conferência interna) **permanece exatamente como está**.

---

## Arquitetura final

```text
┌─────────────────────────────┐         ┌──────────────────────────┐
│  WEB (operação interna)     │         │  ANDROID APK (motorista) │
│  - Cargas / Preparação      │         │  - Acesso por código 6   │
│  - Roteirização             │         │  - Conferência externa   │
│  - Conferência interna      │         │  - Baixa de entrega      │
│  - Monitoramento / Torre    │         │  - GPS background        │
│  - Painel / Auditoria       │         │  - Câmera nativa POD     │
└──────────────┬──────────────┘         └─────────────┬────────────┘
               │                                       │
               └───────────────┬───────────────────────┘
                               ▼
                  ┌──────────────────────────┐
                  │   Lovable Cloud (atual)  │
                  │  - Postgres + RLS        │
                  │  - Edge Functions        │
                  │    (processar-gps,       │
                  │     motorista-acesso)    │
                  │  - Storage (comprovantes)│
                  └──────────────────────────┘
```

**Princípio:** mesma codebase React. O APK é apenas o mesmo build empacotado pelo Capacitor, com **detecção de plataforma** (`Capacitor.isNativePlatform()`) para usar GPS/câmera nativos quando rodando no Android.

---

## Fases de implementação

### Fase 1 — Setup Capacitor (sem mudar UX)
**Objetivo:** gerar um APK que abre o app web atual, sem nenhuma feature nativa ainda. Validar que o ciclo build → APK → instalar funciona.

- Instalar `@capacitor/core`, `@capacitor/cli`, `@capacitor/android`
- Criar `capacitor.config.ts` com `appId: app.lovable.2b66d97b1a6e498c96c489ff683a59a4` e hot-reload apontando para o sandbox Lovable
- Adicionar plataforma Android (`npx cap add android`) — feito pelo usuário após `git pull`
- Criar página `/motorista` (landing do app) que redireciona para `/motorista-acesso`

**Checkpoint:** APK instala em celular físico, abre o app, login por código funciona, conferência externa e baixa de entrega operam (com limitações de GPS/câmera web ainda).

---

### Fase 2 — Câmera nativa para POD
**Objetivo:** substituir `<input type="file">` pela câmera nativa em `BaixaEntrega.tsx`.

- Instalar `@capacitor/camera`
- Criar hook `useNativeCamera.ts` com fallback web (se `!isNativePlatform()` usa o `<input>` atual)
- Plugar em `BaixaEntrega.tsx` mantendo todo o fluxo de múltiplas fotos, preview e upload para bucket `comprovantes`
- Manter `URL.revokeObjectURL` (regra de memória já existente)

**Checkpoint:** motorista tira foto pela câmera nativa, foto sobe para o storage, comprovante aparece no painel web.

---

### Fase 3 — Scanner QR nativo (opcional, melhora ergonomia)
**Objetivo:** scanner mais rápido e estável que `BarcodeDetector` web.

- Instalar `@capacitor-mlkit/barcode-scanning`
- Criar `useNativeScanner.ts` com fallback para o scanner híbrido atual
- Plugar em `ConferenciaExterna.tsx`

**Checkpoint:** leitura de QR de etiqueta funciona em <1s no APK, com vibração ao ler.

---

### Fase 4 — GPS em segundo plano (foreground service) ⭐ Núcleo do projeto
**Objetivo:** GPS continua enviando posições mesmo com a tela apagada ou app em segundo plano.

- Instalar `@capacitor-community/background-geolocation`
- Criar `useGpsTrackerNative.ts` (espelha a interface de `useGpsTracker.ts`):
  - Mesma assinatura: `monitoramentoRotaId`, `enabled`, `paradasCoords`, `config`
  - Mesma lógica de modo crítico (raio de aproximação) e batch
  - Chama a mesma edge function `processar-gps` (zero mudança no backend)
- Criar wrapper `useGpsTrackerHybrid.ts` que escolhe automaticamente:
  - `isNativePlatform()` → usa o native
  - Web → mantém o `useGpsTracker.ts` atual
- Configurar foreground service no `AndroidManifest.xml`:
  - Notificação persistente "Rastreamento ativo — Carga XXX"
  - Permissões: `ACCESS_FINE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`
- Tela de onboarding de permissões em `/motorista-acesso` (LGPD + pedido explícito de "Permitir o tempo todo")

**Checkpoint:** motorista bloqueia o celular, anda 500m, posições continuam chegando na tabela de monitoramento; notificação fixa visível.

---

### Fase 5 — Armazenamento offline robusto
**Objetivo:** garantir que conferência externa e baixa de entrega funcionem 100% offline (áreas sem sinal).

- Instalar `@capacitor/preferences` (configs leves) e `@capacitor/filesystem` (fotos pesadas)
- Reaproveitar `useOfflineEntregas.ts` e `useOfflineConferencia.ts` (IndexedDB já existe)
- Adicionar fila de sincronização: ao recuperar conexão, faz upload das fotos do filesystem nativo + envia POD para o backend
- Indicador visual "X entregas pendentes de sync" na bottom nav mobile

**Checkpoint:** colocar celular em modo avião, fazer 3 baixas de entrega, religar internet → tudo sincroniza automático.

---

### Fase 6 — Wake Lock + UX final do APK
**Objetivo:** polimento.

- `@capacitor/screen-orientation` (travar retrato)
- Wake lock automático enquanto rota ativa
- Splash screen com logo
- Ícone do app personalizado
- Botão "Sair" robusto que finaliza o foreground service

**Checkpoint:** experiência indistinguível de um app nativo profissional.

---

### Fase 7 — Build de produção e distribuição
- Documentar processo: `npm run build && npx cap sync && cd android && ./gradlew assembleRelease`
- Gerar keystore de assinatura (uma vez)
- Distribuir APK assinado via Drive/WhatsApp aos motoristas (sideload)
- (Opcional futuro) Subir para Google Play

---

## Detalhes técnicos

### Plugins definidos
| Plugin | Uso |
|---|---|
| `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` | Base |
| `@capacitor/camera` | Foto POD |
| `@capacitor/preferences` | Token/código motorista local |
| `@capacitor/filesystem` | Fotos offline pesadas |
| `@capacitor/screen-orientation` | Travar retrato |
| `@capacitor-community/background-geolocation` | GPS background ⭐ |
| `@capacitor-mlkit/barcode-scanning` | Scanner QR (Fase 3) |

### Backend — zero mudanças
- `motorista-acesso` (edge function) continua autenticando por código de 6 chars
- `processar-gps` continua recebendo `{monitoramento_rota_id, latitude, longitude, batch}`
- Bucket `comprovantes` continua recebendo as fotos
- RLS, triggers, funções: **nada muda**

### Detecção de plataforma (padrão usado em todos os hooks)
```ts
import { Capacitor } from '@capacitor/core';
const isNative = Capacitor.isNativePlatform();
```

### Roteamento — restrição mobile já existente é mantida
A regra `MobileRedirect` (mobile <768px → rotas operacionais) **continua valendo no APK**, então o motorista nunca vê telas administrativas.

---

## O que é reaproveitado vs. refeito

**Reaproveitado integralmente (~95% do código):**
- Todas as páginas: `MotoristaAcesso`, `ConferenciaExterna`, `BaixaEntrega`
- Hooks: `useOfflineEntregas`, `useOfflineConferencia`, `useAuth`
- Componentes UI, design system, lib utils, PDFs
- Edge functions, schema do banco, RLS
- Lógica de status, geofence, smart tracking

**Refeito/adicionado (apenas adapters nativos):**
- `useGpsTrackerNative.ts` (novo, espelha o web)
- `useGpsTrackerHybrid.ts` (seletor)
- `useNativeCamera.ts` (novo, com fallback)
- `useNativeScanner.ts` (Fase 3, opcional)
- Configurações Android (`AndroidManifest.xml`, ícones, splash)

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Xiaomi/Huawei/OPPO matam foreground service | Documentar para motorista marcar app como "sem otimização de bateria" no onboarding |
| Permissão "background location" rejeitada | Tela explicativa antes de pedir; fallback para tracking só com app aberto |
| Custo de pings GPS aumentar uso do Cloud | Manter batch de 5 posições + distance filter de 100m já existentes |
| Sandbox Lovable cair durante hot-reload no APK | Build de produção remove a URL do `capacitor.config` |

---

## Ordem de execução recomendada

Fase 1 (setup) → Fase 4 (GPS background — **prioridade máxima**) → Fase 2 (câmera) → Fase 5 (offline) → Fase 6 (polimento) → Fase 3 (scanner) → Fase 7 (distribuição).

Justificativa: GPS background é o **motivador real** do projeto. Validar cedo. Scanner nativo é melhoria, não bloqueio.

---

## Próximo passo após aprovação

Começar pela **Fase 1**: instalar Capacitor, criar `capacitor.config.ts` e a página `/motorista`. Depois você faz `git pull` + `npx cap add android` na sua máquina e geramos o primeiro APK de teste.
