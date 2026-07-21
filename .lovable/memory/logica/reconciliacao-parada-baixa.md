---
name: reconciliacao-parada-baixa
description: Baixa entregue reconcilia status operacional, mas não sobrescreve chegada/saída/permanência factual por GPS.
type: feature
---
# Reconciliação parada ↔ baixa

**Problema original:** `processar-gps` cravava paradas como `pulada` (entrega fora de ordem) ou `visita_inconsistente` (permanência < `tempo_minimo_atendimento_min`). Uma vez cravado, `fn_sync_parada_from_baixa` NÃO reabria — a baixa "entregue" posterior não finalizava a parada. Torre mostrava contador subestimado (ex.: DTB9J73 08/07/2026 → 2/10 quando eram 5/10).

**Solução vigente:** `fn_sync_parada_from_baixa` considera também `pulada` e `visita_inconsistente` como reconciliáveis. Ao entrar uma baixa `entregue`:
- Acha a primeira parada do CNPJ que NÃO esteja `finalizada`.
- Marca `finalizada` para progresso operacional.
- **Não seta `horario_chegada`, `horario_saida` nem `tempo_permanencia_min`**; esses campos devem vir de GPS factual.
- Recalcula `paradas_concluidas` da rota.

**O que NÃO muda:**
- Paradas sem baixa (ex.: BLUE parada 6) continuam em `visita_inconsistente` — exceção legítima para gestor cobrar.
- `alertas_monitoramento` de `fora_sequencia`/`entrega_pulada` gerados pelo `processar-gps` permanecem — histórico da anomalia fica registrado.
- `posicoes_gps`, `baixas_entrega`, Prestação de Contas — intactos.

**Regra de precedência:** baixa define verdade operacional de entrega; GPS define verdade de presença/tempo no endereço.

**Contexto do bug reportado (08/07/2026 DTB9J73):**
- 16 NFs baixadas em 5 CNPJs; Torre mostrava 2/10 concluídas.
- Paradas 2,3 marcadas `pulada` (motorista fez parada 4 antes); parada 5 marcada `visita_inconsistente` (2 min de permanência antes das baixas caírem 40min depois).
- Após fix: Torre passa a mostrar 5/10 corretamente conforme baixas caem.
