---
name: reconciliacao-parada-baixa
description: Trigger fn_sync_parada_from_baixa reconcilia paradas 'pulada'/'visita_inconsistente' quando baixa 'entregue' cai depois. Verdade da baixa prevalece sobre inferência do geofence.
type: feature
---
# Reconciliação parada ↔ baixa

**Problema original:** `processar-gps` cravava paradas como `pulada` (entrega fora de ordem) ou `visita_inconsistente` (permanência < `tempo_minimo_atendimento_min`). Uma vez cravado, `fn_sync_parada_from_baixa` NÃO reabria — a baixa "entregue" posterior não finalizava a parada. Torre mostrava contador subestimado (ex.: DTB9J73 08/07/2026 → 2/10 quando eram 5/10).

**Solução (aplicada):** `fn_sync_parada_from_baixa` passou a considerar também `pulada` e `visita_inconsistente` como reconciliáveis. Ao entrar uma baixa `entregue`:
- Acha a primeira parada do CNPJ que NÃO esteja `finalizada` (inclui `pulada`/`visita_inconsistente` agora).
- Marca `finalizada`, seta `horario_saida = registrado_em`, mantém `horario_chegada` do GPS se existiu (senão usa `registrado_em`).
- Zera `is_excecao` (foi entregue de verdade).
- Recalcula `paradas_concluidas` da rota.

**O que NÃO muda:**
- Paradas sem baixa (ex.: BLUE parada 6) continuam em `visita_inconsistente` — exceção legítima para gestor cobrar.
- `alertas_monitoramento` de `fora_sequencia`/`entrega_pulada` gerados pelo `processar-gps` permanecem — histórico da anomalia fica registrado.
- `posicoes_gps`, `baixas_entrega`, Prestação de Contas — intactos.

**Regra de precedência:** verdade operacional (baixa com foto/GPS/recebedor) > inferência automática do geofence.

**Contexto do bug reportado (08/07/2026 DTB9J73):**
- 16 NFs baixadas em 5 CNPJs; Torre mostrava 2/10 concluídas.
- Paradas 2,3 marcadas `pulada` (motorista fez parada 4 antes); parada 5 marcada `visita_inconsistente` (2 min de permanência antes das baixas caírem 40min depois).
- Após fix: Torre passa a mostrar 5/10 corretamente conforme baixas caem.
