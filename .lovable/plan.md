
# Profissionalização Android Motorista + Torre de Controle

## 1. Análise da estrutura atual

**O que já está sólido (manter):**
- Web (Cargas, Conferência, Romaneio, Roteirização, Monitoramento, Dashboards, WMS/TMS) — não tocar.
- Capacitor configurado com `appId` correto, modo dev/prod via `CAP_ENV`, splash, orientação.
- Hook híbrido `useGpsTrackerHybrid` (web vs nativo) já plugado no `BaixaEntrega.tsx` — boa base.
- Plugin `@capacitor-community/background-geolocation` ativo (Foreground Service + notificação persistente).
- Edge function `processar-gps` aceita batch — backend já preparado para múltiplos motoristas.
- Realtime Supabase disponível para Torre.
- Conferência offline com IndexedDB + autosync de fotos já existe.
- RLS, audit log, `is_active_operator()` consistentes.

**Gargalos / riscos identificados:**

| # | Área | Problema | Risco |
|---|------|----------|-------|
| G1 | GPS background | Falta whitelist de bateria por OEM (Xiaomi/Samsung/Motorola). Plugin sozinho não resolve MIUI/One UI. | GPS morre em 10–30 min em campo. |
| G2 | GPS background | Sem heartbeat dedicado (ping de "vivo" mesmo parado). Hoje só envia quando move. | Torre não distingue "parado" de "offline". |
| G3 | GPS background | Sem fila offline persistente própria — se `fetch` falhar, posição é perdida (plugin não enfileira no app). | Buracos de rota em área sem sinal. |
| G4 | GPS background | `useGpsTrackerNative` faz `fetch` direto com anon key; sem retry/backoff/dedup. | Posições perdidas em 4G ruim. |
| G5 | Torre | Sem assinatura Realtime nas telas — atualização hoje depende de polling. | Latência alta, sensação de "travado". |
| G6 | Torre | ETA é estático (calculado na roteirização). Sem recálculo dinâmico baseado em posição atual. | Sem valor real de torre. |
| G7 | Torre | Detecção de parada excessiva / fora de sequência / desvio existe parcialmente como status, mas sem motor automático rodando. | Alertas dependem de operador olhar. |
| G8 | App motorista | Login não-persistente garantido em modo nativo (sessão Supabase ok no web, mas refresh em background precisa validar). | Motorista deslogado no meio do dia. |
| G9 | App motorista | Sem push notification (FCM). | Sem canal para Torre → Motorista. |
| G10 | App motorista | Sem assinatura digital, sem OCR, sem checklist, sem chat. | Lacunas de produto. |
| G11 | App motorista | Upload de fotos resiliente parcial (autosync existe), mas sem retry exponencial nem deduplicação por hash. | Foto duplicada ou perdida. |
| G12 | Arquitetura | Mesmo bundle web carrega em todos motoristas (rota mobile já existe, mas todo o código de Cargas/Romaneio/etc vai junto). | APK ~5–8MB maior, boot mais lento. |
| G13 | Build | Sem pipeline CI/CD, assinatura manual, sem AAB para Play Store. | Distribuição frágil. |
| G14 | Segurança | Anon key embutida no APK (normal), mas sem device binding nem rotação de sessão clara. | Token vazado vira acesso permanente. |

---

## 2. Arquitetura-alvo

```text
+-------------------------------------------------------------+
|  APK MOTORISTA (Capacitor)                                  |
|  - Bundle enxuto (lazy: só rotas mobile + login)            |
|  - Foreground Service GPS (24/7)                            |
|  - Fila local persistente (IndexedDB) p/ GPS+fotos+baixas   |
|  - Worker de sync com retry exponencial + dedup             |
|  - FCM push                                                 |
|  - Wake lock + portrait lock + bateria whitelist guiado     |
+----------------------+--------------------------------------+
                       | HTTPS + Realtime
+----------------------v--------------------------------------+
|  LOVABLE CLOUD (Supabase)                                   |
|  - processar-gps (já existe, evoluir: dedup + heartbeat)    |
|  - motor-alertas (NOVO edge fn agendado: parada excessiva,  |
|    desvio, offline, fora de sequência)                      |
|  - eta-dinamico (NOVO edge fn: recalcula a cada batch GPS)  |
|  - send-push (NOVO edge fn: FCM via service account)        |
|  - tabelas: posicoes_gps, alertas_monitoramento (já existem)|
|  - device_tokens (NOVA), motorista_sessoes (NOVA)           |
+----------------------+--------------------------------------+
                       | Realtime channels
+----------------------v--------------------------------------+
|  WEB TORRE DE CONTROLE                                      |
|  - Subscribe posicoes_gps + monitoramento_rotas + alertas   |
|  - Mapa Leaflet com markers reativos                        |
|  - Replay de rota (timeline scrubber)                       |
|  - Painel de alertas com som                                |
+-------------------------------------------------------------+
```

---

## 3. Plano por fases

### FASE 1 — GPS profissional e resiliente (BASE CRÍTICA)
Sem isso nada funciona. Foco total em não perder ponto.
1. **Fila offline persistente** em IndexedDB para GPS (`gps_pending`) — todo ponto entra na fila antes do envio.
2. **Worker de sync** com retry exponencial (1s, 5s, 30s, 2min, 10min), dedup por timestamp+lat+lng.
3. **Heartbeat de 60s** mesmo parado (envia última posição com flag `heartbeat=true`) para Torre saber que está vivo.
4. **Detecção e UX de bateria/OEM**: tela de onboarding no APK com:
   - Pedir "Localização o tempo todo" (Android 11+).
   - `POST_NOTIFICATIONS` (Android 13+).
   - Deep link para configurações de bateria por fabricante (intent específica Xiaomi/Samsung/Motorola/Oppo/Huawei).
   - Validar e re-pedir se revogadas.
5. **Auto-restart do watcher** se o `addWatcher` morrer (detectar via heartbeat-loss).
6. **`processar-gps` evoluir**: aceitar campo `heartbeat`, dedup server-side por (rota, timestamp, lat, lng).

### FASE 2 — Torre de Controle em tempo real
1. Realtime nas tabelas `posicoes_gps`, `monitoramento_rotas`, `monitoramento_paradas`, `alertas_monitoramento`.
2. Marker do caminhão reativo (sem polling).
3. **Edge function `motor-alertas`** rodando em cron (a cada 1min):
   - parada excessiva (sem mover > X min fora de cliente)
   - motorista offline (sem heartbeat > Y min)
   - fora de sequência (chegou em cliente que não era o próximo)
   - desvio de rota (distância da rota planejada > Z m)
4. **ETA dinâmico**: edge fn `eta-dinamico` recalcula a cada batch baseado em haversine + velocidade média da rota.
5. **Replay de rota**: timeline scrubber que rebobina `posicoes_gps` da rota.
6. **Painel de alertas global** com som + badge no header da Torre.

### FASE 3 — App Motorista profissional
1. **Login persistente nativo**: validar refresh-token em background a cada start, fallback offline com sessão cacheada criptografada (Capacitor Preferences + crypto).
2. **FCM push**: plugin `@capacitor/push-notifications`, registro de `device_token` por motorista, edge fn `send-push`.
3. **Assinatura digital**: canvas touch na BaixaEntrega → PNG → upload para `comprovantes/`.
4. **Múltiplas fotos**: já existe parcialmente, evoluir para galeria + reorder + dedup por hash SHA-1 do blob.
5. **OCR de comprovantes** (opcional fase 3.5): MLKit Text Recognition (mesmo plugin família do barcode) para ler nome/data do canhoto.
6. **Checklist pré-viagem**: tela rápida (combustível, pneus, EPI) gravada em `checklist_viagem` (nova tabela).
7. **Ocorrências**: lista pré-definida + foto + GPS automático.
8. **Chat operacional motorista↔torre**: tabela `chat_mensagens` + Realtime + push.
9. **Modo noturno**: theme switch automático por horário.

### FASE 4 — Arquitetura, build e performance
1. **Bundle splitting agressivo**: rotas mobile (`/conferencia-*`, `/baixa-entrega`, `/login`) em chunk próprio, web admin em chunk separado, lazy via `React.lazy`.
2. **Reorganização de pastas**: `src/mobile/` (telas/hooks só do APK) vs `src/desktop/` (web), `src/shared/`.
3. **Build script único**: `scripts/build-apk-release.sh` já existe — adicionar geração de **AAB** (`bundleRelease`) para Play Store.
4. **CI/CD GitHub Actions** (template) — build, sign, upload artifact.
5. **Análise de tamanho**: `rollup-plugin-visualizer` no vite, alvo APK < 8MB.

### FASE 5 — Segurança
1. **Device binding**: hash do device_id (`Device.getId()`) gravado em `motorista_sessoes`, validado a cada login. Login em novo device exige re-aprovação.
2. **Rotação de sessão**: refresh token a cada 1h, force re-login após 30 dias.
3. **Criptografia local**: dados sensíveis em IndexedDB (sessão, tokens) cifrados com chave derivada do device_id.
4. **Sanitização de uploads**: validar mime/size no edge antes de gravar em Storage.
5. **Auditoria de baixas**: já existe via audit_log, expandir para fotos e assinaturas.

---

## 4. Ordem de execução proposta

1. **Fase 1** (GPS resiliente) — 1 sprint. **Sem isso nada de torre funciona.**
2. **Fase 2** (Torre realtime + motor de alertas + ETA) — 1 sprint.
3. **Fase 3** (App motorista profissional: push, assinatura, checklist, chat) — 2 sprints.
4. **Fase 4** (bundle splitting + AAB + CI/CD) — 1 sprint.
5. **Fase 5** (segurança avançada) — 1 sprint.

Cada fase é independente e o web atual continua intocado em todas elas.

---

## 5. O que vou tocar (escopo Fase 1, primeira a executar)

**Frontend (mobile-only):**
- `src/hooks/useGpsTrackerNative.ts` — adicionar fila IndexedDB + retry + heartbeat + auto-restart.
- `src/hooks/useGpsQueue.ts` (NOVO) — gerenciador de fila persistente.
- `src/pages/BaixaEntrega.tsx` — onboarding de permissões + deep link OEM.
- `src/components/mobile/PermissoesOnboarding.tsx` (NOVO) — wizard de permissões.

**Backend:**
- Migração: adicionar `heartbeat boolean default false` e índice de dedup em `posicoes_gps`.
- `supabase/functions/processar-gps/index.ts` — aceitar heartbeat + dedup.

**Não vou tocar:** nenhum arquivo de Cargas, Romaneio, Roteirização, Conferência, Dashboards, Monitoramento web (apenas leitura para entender contratos).

---

**Posso começar pela Fase 1 (GPS resiliente)?** Ou prefere ajustar prioridade/ordem antes?
