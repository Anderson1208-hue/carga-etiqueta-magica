---
name: transistorsoft-v9-config
description: Transistorsoft Capacitor v9 exige config agrupada; não usar formato flat/legacy.
type: constraint
---
# Transistorsoft Capacitor v9 — Config Agrupada

`@transistorsoft/capacitor-background-geolocation` v9 usa `Config` agrupado:
- `geolocation` — accuracy, distanceFilter, stop detection.
- `activity` — detecção de movimento/parada.
- `http` — url, headers, params, `rootProperty`.
- `persistence` — `locationTemplate`, `extras`, `persistMode`.
- `app` — `stopOnTerminate`, `startOnBoot`, `enableHeadless`, `notification`, rationale.
- `logger` — debug/logLevel.

**Nunca reverter para config flat/legacy** (`desiredAccuracy`, `url`, `httpRootProperty`, `locationTemplate`, `persistMode`, `notification` na raiz). Em v9 isso é ignorado ou aplicado parcialmente e causa GPS que só atualiza com app aberto / tela ativa.

**Por quê:** Docs e tipos locais v9 (`@transistorsoft/background-geolocation-types`) definem `Config` apenas com grupos; `httpRootProperty` foi renomeado para `http.rootProperty`.

## Tela bloqueada com veículo parado

Para monitoramento do motorista, usar `geolocation.distanceFilter = 0` com `locationUpdateInterval = 60000`.

**Por quê:** no Android, `locationUpdateInterval`/`fastestLocationUpdateInterval` só substituem o filtro por distância quando `distanceFilter` é `0`. Com `distanceFilter = 50`, o teste parado com tela bloqueada não gera pontos nativos; com app aberto, o watchdog JS mascara o problema chamando `getCurrentPosition`.

Não depender de `registerHeadlessTask` JS no Capacitor v9: os tipos compartilhados declaram o método, mas o wrapper runtime instalado não o expõe. O caminho correto é HTTP nativo (`http` + `persistence.locationTemplate`).
