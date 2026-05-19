# Projeto Arquivado: "APP tipo Waze" (APP Motorista Parrudo)

> **Status:** ARQUIVADO — aguardando conclusão dos testes do APK atual.
> **Retomar quando:** todos os ajustes do APK em campo estiverem mapeados e estabilizados.

---

## Contexto

Após os testes do APK atual (GPS híbrido, Foreground Service, fila offline, scanner MLKit, câmera nativa, build release assinado), vamos consolidar a lista de ajustes/inclusões necessários e só então iniciar este projeto.

Apelido interno: **"APP tipo Waze"** — referência a um app mobile parrudo, leve, com baixo consumo de bateria e alertas inteligentes para motorista + torre. **Não** é navegação turn-by-turn rua a rua.

---

## Escopo planejado (a executar depois)

### Fase 1 — GPS resiliente (~100 créditos)
- Tuning de bateria (intervalos adaptativos, distance filter)
- Reforço da fila offline + retomada automática
- Validação em campo de diferentes fabricantes (Xiaomi, Samsung, Motorola)

### Fase 2 — Motor de Alertas + TTS + Torre Realtime (~150 créditos)
- Motor de regras: saída de rota, pulou parada, parado tempo demais, fora de janela
- Alerta sonoro/voz nativa (TTS) para o motorista
- Push em tempo real para a Torre de Controle
- Tela "Meus Alertas" no APK

### Fase 3 — Tuning bateria + AAB Play Store (~100 créditos)
- Otimizações finais de consumo
- Build AAB assinado para Play Store (interno/fechado)
- Roteiro de publicação

### Opcional — ETA dinâmico
- Cálculo de ETA por parada com base em histórico + GPS atual

---

## Custos estimados (referência)

- **Desenvolvimento Lovable:** ~350 créditos no total (Fases 1+2+3)
- **Mensal recorrente:** R$ 0–50/mês (Lovable Cloud + FCM grátis + OSM grátis)
- **Play Store:** US$ 25 (taxa única)
- **Comparativo:** Cobli/similar p/ 20 veículos ≈ R$ 2.400/mês. Solução própria ≈ R$ 50–150/mês. ROI 1–2 meses.

---

## Base já pronta (não refazer)

- APK Capacitor com `appId` próprio
- Foreground Service GPS (`@capacitor-community/background-geolocation`)
- Hook híbrido `useGpsTrackerHybrid` (nativo vs web)
- Fila offline GPS (IndexedDB + heartbeat 60s)
- Scanner nativo MLKit + câmera nativa
- Build release assinado (`scripts/build-apk-release.sh`)
- Ambientes DEV/HOMOLOG/PROD
- Tela de diagnóstico do motorista
- Smart GPS tracking (120s normal / 60s crítico)

---

## Decisão atual

Não iniciar nenhuma das fases agora. Primeiro: rodar o APK atual em campo, coletar feedback dos motoristas e mapear ajustes. Depois retomar este plano.
