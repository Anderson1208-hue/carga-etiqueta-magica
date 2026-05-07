---
name: Sync Baixa Idempotente
description: Sync offline de baixas_entrega checa duplicata por (nf_id, registrado_em) antes de inserir
type: feature
---

No `handleSync` de `BaixaEntrega.tsx`, antes do INSERT em `baixas_entrega`, verificar se já existe registro com mesmo `nf_id` + `registrado_em`. Se existir, pular insert e apenas marcar local como sync.

**Por quê:** se o INSERT funcionar mas `markAsSynced` (IndexedDB) falhar (perda de rede no meio), o próximo retry duplicaria a baixa. `registrado_em` é gerado no momento do save offline, então a tupla é estável.

Não criar UNIQUE constraint no banco — registros legítimos podem coincidir em casos raros (mesma NF re-entregue com mesmo timestamp seria impossível na prática mas a verificação client-side é suficiente).
