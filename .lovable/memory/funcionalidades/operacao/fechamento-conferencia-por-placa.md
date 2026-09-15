---
name: Fechamento da 2ª conferência por placa (escopo IBAC)
description: Regra de fechamento do veículo na Conferência Externa contando só NFs de emitente IBAC autorizado; forçar exige admin + motivo
type: feature
---

Na Conferência Externa (Etapa 2 / Expedição), o veículo só é fechado quando **todas as NFs do escopo IBAC** estiverem 100% bipadas.

- Escopo = `notas_fiscais.cnpj_emitente` cujos 8 primeiros dígitos estejam ativos em `cnpj_envio_canhoto_auto`. NFs de outros embarcadores aparecem com selo "Fora do escopo" e não contam.
- RPC `conferencia_externa_status_veiculo(uuid)` → jsonb com `total_nfs`, `total_escopo`, `fora_escopo`, `conferidas_escopo`, `faltando_escopo`, `nfs_escopo`, `nfs_faltando`, além do estado de fechamento.
- RPC `fechar_conferencia_veiculo(uuid, p_forcar, p_motivo)` grava em `veiculos`: `conferencia_externa_fechada_em/_por`, `conferencia_externa_com_pendencia`, `conferencia_externa_pendencia_motivo`.
- Fechamento forçado: só `is_admin`, com motivo de no mínimo 5 caracteres (auditável).
- UI: painel no topo da lista de NFs em `src/pages/ConferenciaExterna.tsx`.
- Não altera etiquetas, fluxo do app do motorista nem `cargas.status`.
