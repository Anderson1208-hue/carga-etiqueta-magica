---
name: Raio de geofence customizado por destinatário
description: destinatarios.raio_geofence_metros sobrescreve o raio padrão global ao criar monitoramento_paradas. Prioridade 2 do parecer Manus 10/07/2026.
type: feature
---

Coluna `destinatarios.raio_geofence_metros` (INTEGER NULL). Quando preenchida, `MonitoramentoRotas.criarMonitoramentoParaVeiculo` usa esse valor em `monitoramento_paradas.raio_geofence_metros` no lugar de `monitoramento_config.raio_padrao_metros`.

**Motivação:** grandes centros (Atacadão, Assaí, Sam's Club) descarregam em docas 300–600 m do ponto ROOFTOP. Um raio global de 100 m nunca fecha geofence nesses clientes, mesmo após backfill Google. Solução: raio por cliente (ex.: Atacadiao=500m, Varejo=80m).

**Aplicação:** só afeta rotas criadas depois da edição do cadastro (não retroage a paradas já materializadas). Configuração feita na tela `/destinatarios` → campo "Raio de geofence customizado (metros)". Vazio = usa padrão global.

**Não altera:** `raio_padrao_metros` continua sendo o fallback global em `monitoramento_config`.
