---
name: gps-background-nao-funciona-campo
description: GPS background do APK Motorista — gate de validação ativa + detecção server-side de gaps. Cliente confirmou que "Permitir o tempo todo" não aparecia.
type: feature
---
# GPS background do APK Motorista — Gate de validação ativa (A+B)

## Problema confirmado em campo (26/05/2026)
Mesmo com `@capacitor-community/background-geolocation` instalado e
`useGpsTrackerNative` com Foreground Service, **o GPS parava de enviar com
tela bloqueada**. Cliente confirmou: a opção "Permitir o tempo todo" não
aparecia na tela de permissão do Android — é necessário entrar em
Configurações → Apps → Permissões → Localização manualmente.

## Solução implementada (A+B)

### A — Wizard de validação ativa (bloqueante)
`src/components/mobile/ValidacaoGpsBackground.tsx`
- Fullscreen modal antes de o GPS tracker ativar.
- Fluxo: Intro → Abrir Configurações (via `BackgroundGeolocation.openSettings()`) → Teste 90s.
- Teste comportamental: registra um watcher temporário e CONTA callbacks
  recebidos enquanto `document.hidden === true` (tela bloqueada). Exige
  `>= 2 callbacks com tela apagada` para considerar válido.
- Por que comportamental e não API: nem `@capacitor/geolocation` nem o
  plugin de background expõem distinção entre "always" vs "whileInUse" no
  Android. A única forma confiável de saber se "Permitir o tempo todo"
  está ativo é observar se o callback continua chegando com tela apagada.
- Persistência: `localStorage["bg_gps_validated_v2_at"]` com TTL de 14 dias.
- Web (sem Capacitor) passa direto — `isBackgroundGpsValidated()` retorna true.

### Gate no MotoristaAcesso
`src/pages/MotoristaAcesso.tsx` — `useGpsTrackerHybrid` e
`useGpsQueueWorker` só ativam quando `gpsValidated === true`. Banner
warning aparece se motorista cancelar o wizard.

### B — Detecção server-side de gaps GPS
`supabase/functions/processar-gps/index.ts` — antes de atualizar
`monitoramento_rotas.ultima_atualizacao`, compara com o valor antigo.
Se gap > 5min em rota ativa, insere alerta `tipo='gps_instavel'` em
`alertas_monitoramento` (dedup: não cria outro nos próximos 10min).
A Torre vê automaticamente no `AlertasPanel` (lista genérica de alertas).

## Limitações conhecidas
- Não resolve otimização de bateria agressiva (Xiaomi/Samsung). O wizard
  pega esses casos no teste de 90s (callbacks não chegarão) e instrui.
- Swipe-kill da lista de recentes mata o Foreground Service — sem solução
  programática, instruído no wizard.
- AndroidManifest continua fora do controle Lovable. Conferir manualmente
  que tem `ACCESS_BACKGROUND_LOCATION` e `FOREGROUND_SERVICE_LOCATION`.

## Diagnóstico após 10+ APKs (04/06/2026)
Não gerar outro APK sem separar captura/envio/gravação/exibição.

Evidências de banco:
- `posicoes_gps` recebeu posições recentes; então endpoint e gravação funcionam quando o app envia.
- `processar-gps` atualiza `monitoramento_rotas.ultima_lat`, `ultima_lng`, `ultima_atualizacao` usando service role; não é bloqueio de RLS.
- Gaps grandes entre posições e poucos heartbeats indicam perda antes do backend: captura/callback JS/fila em background.

Correções/decisões:
- Torre de Controle não deve filtrar somente `created_at >= hoje`; rotas ativas antigas com GPS novo precisam aparecer.
- Build script deve bloquear Manifest sem `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `ACCESS_BACKGROUND_LOCATION`, `FOREGROUND_SERVICE`, `FOREGROUND_SERVICE_LOCATION`, `POST_NOTIFICATIONS`, `WAKE_LOCK`, `CAMERA`.
- Se o problema persistir com Manifest válido e APK PROD, a causa estrutural é dependência da WebView/JS no `@capacitor-community/background-geolocation`; recomendação: migrar para plugin com envio nativo persistente ou módulo Android nativo que envie direto ao backend.

## Decisão de parada após ciclo de APKs (08/06/2026)
Não continuar gerando APKs por tentativa. O único caminho aceitável é teste controlado:
- APK DEBUG para validar Transistorsoft sem licença; APK release sem licença não é critério.
- Confirmar em banco `source='transistor-native-http'` durante tela bloqueada.
- Se `transistor-native-http` não continuar chegando bloqueado em debug com `state.enabled=true`, parar a abordagem JS/Capacitor e migrar para módulo Android nativo/Kotlin com ForegroundService + HTTP direto.
- Correção aplicada: `ValidacaoGpsBackground` não pode chamar `BackgroundGeolocation.stop()` após sucesso, pois isso derruba o Foreground Service antes do rastreamento real.
