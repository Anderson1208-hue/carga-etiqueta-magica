---
name: tela-diagnostico-motorista
description: Tela /motorista/diagnostico — status técnico de GPS/fila/permissões/wakelock para troubleshooting em campo via APK.
type: feature
---
# Tela de Diagnóstico do Motorista

## Acesso
- Rota `/motorista/diagnostico` (permitida no `MobileRedirect` via prefixo `/motorista/*`).
- Ícone Activity (lucide) discreto:
  - canto superior direito do card de login (sem código)
  - ao lado do botão "Sair" no header logado
- Sempre disponível, mesmo sem login — útil para suporte por telefone.

## O que mostra
- Conectividade: `navigator.onLine` + listeners online/offline
- GPS: `navigator.permissions.query({name:'geolocation'})`, modo do tracker (Nativo FS vs Web), foreground service ativo, watcher iniciado / restarts, wake lock suportado
- Posição agora: getCurrentPosition + link Google Maps
- Envio: fila offline (`pendingCount`), último enqueue, último envio OK, último erro
- Aparelho: plataforma Capacitor, host, user-agent
- Botão "Copiar diagnóstico" → texto pronto para colar no WhatsApp do suporte

## Fonte dos dados
- `src/lib/gpsTelemetry.ts` — localStorage com:
  - `markEnqueue(pos)` chamado em `useGpsTrackerNative` a cada ponto enfileirado
  - `markSent(count)` chamado em `useGpsQueueWorker` quando `drainQueue` retorna sent>0
  - `markError(msg)` em falhas de enqueue/drain
  - `markWatcherStart()` em cada start do watcher (incrementa `watcherRestarts`)
- `pendingCount()` direto do IndexedDB (`gpsQueue`)

## Por que importa
- Suporte operacional sem precisar Chrome DevTools / cabo USB
- Diferencia DEV vs PROD via `BuildModeBadge` (já existente)
- Identifica rapidamente: permissão negada, sem internet, fila empilhando, watcher morrendo
