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
