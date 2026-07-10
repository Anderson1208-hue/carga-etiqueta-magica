---
name: Sync coordenadas parada ← cadastro mestre
description: monitoramento_paradas reconcilia lat/lng com destinatario_enderecos ao iniciar rota (Prioridade 1 do parecer Manus 10/07/2026)
type: feature
---

Ao criar `monitoramento_paradas` em `MonitoramentoRotas.tsx` (`criarMonitoramentoParaVeiculo`), após montar `paradasInsert` a partir de `roteirizacao_paradas`, o sistema busca em `destinatario_enderecos` (por CNPJ → `destinatarios.id`) e sobrescreve `latitude`/`longitude` com o endereço `principal` (fallback: primeiro com coordenadas).

**Por quê:** roteirizações antigas podem ter coordenadas defasadas. Enriquecimentos posteriores (backfill Google/ROOFTOP) atualizam apenas `destinatario_enderecos`; sem reconciliação, a parada nasce com coordenada estale (casos observados >6,5 km de defasagem).

**Não altera:** cálculo de raio (`raio_geofence_metros` continua global — Prioridade 2 pendente: raio dinâmico por cliente).
