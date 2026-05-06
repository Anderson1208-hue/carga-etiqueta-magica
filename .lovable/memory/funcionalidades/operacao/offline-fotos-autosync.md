---
name: offline-fotos-autosync
description: Foto offline persistida em IndexedDB (Blob), auto-sync ao voltar online, badge de pendentes no MobileBottomNav.
type: feature
---
# Offline robusto — fotos + auto-sync (Fase 5)

## Schema IndexedDB
- DB `entregas_offline` v2.
- Stores: `nfs_cache`, `baixas_pendentes`, **`fotos_pendentes`** (novo).
- `fotos_pendentes` keyPath = `baixa_id`. Guarda `{ baixa_id, blob: File, contentType, fileName, savedAt }`.

## API exportada (`useOfflineEntregas.ts`)
- `saveFotoOffline(baixaId, file)` — chamado no `BaixaEntrega.tsx` quando salva offline.
- `getFotoOffline(baixaId): Blob | null` — chamado no `handleSync` para upload.
- `deleteFotoOffline(baixaId)` — chamado após upload bem-sucedido.
- `getPendingBaixasCount(): Promise<number>` — standalone, usado pelo `MobileBottomNav`.
- `notifyPendingChanged()` — dispara `CustomEvent("offline-pending-changed")`. Chamado em `saveBaixaOffline` e `markAsSynced`.

## Fluxo
1. Motorista offline: tira foto → `saveBaixaOffline` cria record → `saveFotoOffline(record.id, file)` salva Blob no IDB.
2. Volta online: `useEffect` em `BaixaEntrega.tsx` detecta `isOnline && !offlineMode` → debounce 1.5s → `handleSync()`.
3. `handleSync`: para cada baixa pendente, faz upload da foto (se houver) → insert na tabela → `deleteFotoOffline`.
4. `MobileBottomNav` mostra badge vermelho com contagem na aba "Baixa Entrega".

## Regras
- Foto **agora é exigida** mesmo no modo offline para ocorrência "entregue" (antes era pulada).
- Reentrega **continua exigindo conexão** (precisa de vínculos no servidor).
- Auto-sync nunca dispara se `offlineMode` manual estiver ativo (respeita escolha do usuário).
- Blob persiste através de reload/fechar app — só é apagado após sync confirmado.
